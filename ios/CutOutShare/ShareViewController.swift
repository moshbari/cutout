import UIKit
import UniformTypeIdentifiers

/// "Share → CutOut" from Photos, Files, Mail, Safari… Takes the first picture or
/// PDF it is handed, drops it in the folder CutOut shares with this extension,
/// then opens CutOut, which picks it up from there and loads it straight away.
final class ShareViewController: UIViewController {

    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.055, green: 0.063, blue: 0.078, alpha: 1)
        label.text = "Opening in CutOut…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])
    }

    private var started = false
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        Task { await handOver() }
    }

    // MARK: - the hand-over

    @MainActor
    private func handOver() async {
        guard let provider = firstAttachment() else { return fail("CutOut opens pictures and PDFs.") }
        do {
            let (data, ext, mime) = try await load(provider)
            let name = (provider.suggestedName ?? (mime == "application/pdf" ? "document" : "image"))
            try SharedInbox.put(data, ext: ext, mime: mime, name: name)
        } catch {
            return fail("That file could not be read.")
        }
        if openCutOut(URL(string: "\(SharedInbox.urlScheme)://shared")!) {
            done()
        } else {
            // the picture is already waiting — it opens the next time CutOut does
            label.text = "Ready. Open CutOut to edit it."
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            done()
        }
    }

    private func firstAttachment() -> NSItemProvider? {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let all = items.flatMap { $0.attachments ?? [] }
        return all.first { $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) }
            ?? all.first { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
    }

    /// Original bytes for PNG / JPEG / PDF; anything else (HEIC, TIFF, a UIImage
    /// handed over in memory) is re-encoded once as PNG so nothing is lost.
    private func load(_ p: NSItemProvider) async throws -> (Data, String, String) {
        if p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
            return (try await data(p, .pdf), "pdf", "application/pdf")
        }
        if p.hasItemConformingToTypeIdentifier(UTType.png.identifier), let d = try? await data(p, .png) {
            return (d, "png", "image/png")
        }
        if p.hasItemConformingToTypeIdentifier(UTType.jpeg.identifier), let d = try? await data(p, .jpeg) {
            return (d, "jpg", "image/jpeg")
        }
        if let d = try? await data(p, .image), let png = UIImage(data: d)?.pngData() {
            return (png, "png", "image/png")
        }
        // some apps only hand over a UIImage object
        let image: UIImage = try await withCheckedThrowingContinuation { c in
            p.loadObject(ofClass: UIImage.self) { obj, err in
                if let img = obj as? UIImage { c.resume(returning: img) }
                else { c.resume(throwing: err ?? CocoaError(.fileReadCorruptFile)) }
            }
        }
        guard let png = image.pngData() else { throw CocoaError(.fileReadCorruptFile) }
        return (png, "png", "image/png")
    }

    private func data(_ p: NSItemProvider, _ type: UTType) async throws -> Data {
        try await withCheckedThrowingContinuation { c in
            p.loadDataRepresentation(forTypeIdentifier: type.identifier) { d, err in
                if let d { c.resume(returning: d) } else { c.resume(throwing: err ?? CocoaError(.fileReadNoSuchFile)) }
            }
        }
    }

    /// Extensions get no UIApplication.shared, but the app object is still on the
    /// responder chain — asking it directly is the way to switch over to CutOut.
    private func openCutOut(_ url: URL) -> Bool {
        var r: UIResponder? = self
        while let next = r {
            if let app = next as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                return true
            }
            r = next.next
        }
        return false
    }

    private func fail(_ message: String) {
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { self.done() }
    }

    private func done() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
