import SwiftUI

@main
struct CutOutApp: App {
    var body: some Scene {
        WindowGroup {
            EditorView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

struct EditorView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EditorController { EditorController() }
    func updateUIViewController(_ controller: EditorController, context: Context) {}
}
