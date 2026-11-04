import Foundation

/// The hand-off folder between the Share extension and the app: the extension
/// writes one file plus a small note about it; the app takes it and deletes it.
enum SharedInbox {
    static let group = "group.com.zpresso.cutout"
    static let urlScheme = "cutoutapp"

    struct Item: Codable { let file: String; let mime: String; let name: String }

    private static var folder: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("Inbox", isDirectory: true)
    }
    private static var note: URL? { folder?.appendingPathComponent("pending.json") }

    static func put(_ data: Data, ext: String, mime: String, name: String) throws {
        guard let folder, let note else { throw CocoaError(.fileNoSuchFile) }
        let fm = FileManager.default
        try? fm.removeItem(at: folder)                       // only ever the newest share
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = "shared.\(ext)"
        try data.write(to: folder.appendingPathComponent(file), options: .atomic)
        let clean = (name as NSString).deletingPathExtension
        try JSONEncoder().encode(Item(file: file, mime: mime, name: clean)).write(to: note, options: .atomic)
    }

    /// The waiting file, if any — removed from the inbox as it is handed over.
    static func take() -> (data: Data, mime: String, name: String)? {
        guard let folder, let note,
              let raw = try? Data(contentsOf: note),
              let item = try? JSONDecoder().decode(Item.self, from: raw) else { return nil }
        let data = try? Data(contentsOf: folder.appendingPathComponent(item.file))
        try? FileManager.default.removeItem(at: folder)
        guard let data else { return nil }
        return (data, item.mime, item.name)
    }
}
