import UIKit
import WebKit
import PhotosUI
import UniformTypeIdentifiers

/// Hosts the CutOut web app and gives it the two things a web page cannot do
/// on its own: read a photo out of the library at full resolution, and write
/// the result back into it.
final class EditorController: UIViewController {

    private var web: WKWebView!
    private let background = UIColor(red: 0.055, green: 0.063, blue: 0.078, alpha: 1)

    // MARK: - lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = background

        let controller = WKUserContentController()
        controller.add(self, name: "cutout")
        controller.addUserScript(WKUserScript(
            source: "window.__CUTOUT_NATIVE__ = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        if let root = Bundle.main.url(forResource: "Web", withExtension: nil) {
            config.setURLSchemeHandler(BundleSchemeHandler(root: root), forURLScheme: BundleSchemeHandler.scheme)
        }
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = background
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }
        #endif

        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        // Served through our own scheme rather than file:// — WebKit refuses module
        // scripts and workers from file URLs, and the PDF reader (pdf.js) needs both.
        web.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { false }

    // MARK: - talking back to the page

    private func js(_ script: String) {
        DispatchQueue.main.async { self.web.evaluateJavaScript(script, completionHandler: nil) }
    }

    private func report(_ ok: Bool, _ message: String) {
        let escaped = message.replacingOccurrences(of: "\\", with: "\\\\")
                             .replacingOccurrences(of: "'", with: "\\'")
        js("window.__cutoutNative && window.__cutoutNative.saved(\(ok), '\(escaped)')")
    }

    private func deliver(_ data: Data, mime: String, name: String) {
        let name = name.replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\\", with: "")
        let payload = data.base64EncodedString()
        js("window.__cutoutNative && window.__cutoutNative.openImage('\(payload)','\(mime)','\(name)')")
    }
}

// MARK: - bridge

extension EditorController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "pick":
            chooseSource()
        case "share":
            share(base64: body["data"] as? String, name: body["name"] as? String)
        case "save":
            save(base64: body["data"] as? String)
        case "haptic":
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        default:
            break
        }
    }
}

// MARK: - choosing where to open from

extension EditorController: UIDocumentPickerDelegate {

    /// Photos for pictures; Files for PDFs (and pictures kept outside the photo library).
    private func chooseSource() {
        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        sheet.addAction(UIAlertAction(title: "Photos", style: .default) { _ in self.presentPicker() })
        sheet.addAction(UIAlertAction(title: "Files (PDF or image)", style: .default) { _ in self.presentFiles() })
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        sheet.overrideUserInterfaceStyle = .dark
        anchor(sheet.popoverPresentationController)
        present(sheet, animated: true)
    }

    private func presentFiles() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf, .image], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        picker.overrideUserInterfaceStyle = .dark
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let name = url.deletingPathExtension().lastPathComponent
        let type = UTType(filenameExtension: url.pathExtension) ?? .data
        DispatchQueue.global(qos: .userInitiated).async {
            guard let data = try? Data(contentsOf: url) else {
                self.report(false, "That file could not be opened.")
                return
            }
            if type.conforms(to: .pdf) {
                self.deliver(data, mime: "application/pdf", name: name)
            } else if type.conforms(to: .png) {
                self.deliver(data, mime: "image/png", name: name)
            } else if type.conforms(to: .jpeg) {
                self.deliver(data, mime: "image/jpeg", name: name)
            } else if let image = UIImage(data: data), let png = image.pngData() {
                self.deliver(png, mime: "image/png", name: name)     // HEIC, TIFF… → PNG once
            } else {
                self.report(false, "That file could not be opened.")
            }
        }
    }

    /// iPad shows sheets as popovers, which need somewhere to point.
    private func anchor(_ popover: UIPopoverPresentationController?) {
        guard let popover else { return }
        popover.sourceView = view
        popover.sourceRect = CGRect(x: view.bounds.midX, y: view.safeAreaInsets.top + 44, width: 1, height: 1)
        popover.permittedArrowDirections = .up
    }
}

// MARK: - sharing a finished file (PDF)

extension EditorController {

    private func share(base64: String?, name: String?) {
        guard let base64, let data = Data(base64Encoded: base64) else {
            report(false, "Could not make the file.")
            return
        }
        let safe = (name ?? "CutOut.pdf").replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
        do { try data.write(to: url, options: .atomic) } catch {
            report(false, "Could not make the file.")
            return
        }
        DispatchQueue.main.async {
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, done, _, _ in
                if done { self.report(true, "Done") }
            }
            self.anchor(sheet.popoverPresentationController)
            self.present(sheet, animated: true)
        }
    }
}

// MARK: - reading from Photos

extension EditorController: PHPickerViewControllerDelegate {

    private func presentPicker() {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 1
        config.preferredAssetRepresentationMode = .current   // no transcoding, keep every pixel
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.overrideUserInterfaceStyle = .dark
        present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else { return }

        let name = (provider.suggestedName ?? "image")
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: "\\", with: "")

        // Hand the original bytes over when the format is one the page can decode,
        // otherwise (HEIC, TIFF, …) re-encode once as PNG so nothing is lost.
        for (type, mime) in [(UTType.png, "image/png"), (UTType.jpeg, "image/jpeg")] {
            guard provider.hasItemConformingToTypeIdentifier(type.identifier) else { continue }
            provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { [weak self] data, _ in
                guard let self else { return }
                if let data { self.deliver(data, mime: mime, name: name) }
                else { self.transcode(provider, name: name) }
            }
            return
        }
        transcode(provider, name: name)
    }

    private func transcode(_ provider: NSItemProvider, name: String) {
        guard provider.canLoadObject(ofClass: UIImage.self) else {
            report(false, "That image could not be opened.")
            return
        }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self else { return }
            guard let image = object as? UIImage, let data = image.pngData() else {
                self.report(false, "That image could not be opened.")
                return
            }
            self.deliver(data, mime: "image/png", name: name)
        }
    }
}

// MARK: - writing back to Photos

extension EditorController {

    private func save(base64: String?) {
        guard let base64, let data = Data(base64Encoded: base64) else {
            report(false, "Could not read the image.")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self else { return }
            guard status == .authorized || status == .limited else {
                self.report(false, "Allow Photos access in Settings to save.")
                return
            }
            PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            } completionHandler: { ok, error in
                if ok {
                    DispatchQueue.main.async { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                    self.report(true, "Saved to Photos")
                } else {
                    self.report(false, error?.localizedDescription ?? "Could not save to Photos.")
                }
            }
        }
    }
}

// MARK: - navigation

extension EditorController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        if let shot = DemoMode.shot {
            if shot == 9 || shot == 10 { deliver(DemoMode.samplePdf(), mime: "application/pdf", name: "Q3 Report") }
            else if shot != 6 && shot != 11 { deliver(DemoMode.sampleTable(), mime: "image/png", name: "Q3 Expenses") }
            if let script = DemoMode.script(forShot: shot) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { self.js(script) }
            }
            return
        }
        guard DemoMode.requested else { return }
        deliver(DemoMode.sampleTable(), mime: "image/png", name: "Q3 Expenses")
        guard DemoMode.autoCut else { return }
        // remove the card-number column, then save — exercises the whole chain
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            self.js("CutOut.setBand('v', 700, 940); CutOut.cut();")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                self.js("document.getElementById('btnSave').click();")
            }
        }
        #endif
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("CUTOUT-FAIL %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("CUTOUT-PROVFAIL %@", error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("CUTOUT-TERMINATED")
        webView.reload()
    }

    /// The app is entirely local; anything that tries to leave opens in Safari instead.
    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, url.isFileURL || url.scheme == BundleSchemeHandler.scheme {
            decisionHandler(.allow)
            return
        }
        if let url = action.request.url, action.navigationType == .linkActivated {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }
}

// MARK: - serving the bundled web app

/// Answers `cutout://app/<path>` from the Web folder inside the app, so the page
/// gets a real origin of its own. Nothing here ever touches the network.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "cutout"
    private let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    private static let types: [String: String] = [
        "html": "text/html", "js": "text/javascript", "mjs": "text/javascript",
        "css": "text/css", "json": "application/json", "webmanifest": "application/manifest+json",
        "png": "image/png", "svg": "image/svg+xml", "txt": "text/plain",
        "ttf": "font/ttf", "pfb": "application/octet-stream", "bcmap": "application/octet-stream",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish()
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
