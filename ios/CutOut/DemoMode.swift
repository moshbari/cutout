#if DEBUG
import UIKit

/// Debug-only harness. Launched with `-CutOutDemo` it pushes a generated table
/// image through the exact same delivery path the photo picker uses, so the
/// native ↔ web plumbing can be exercised without driving the picker UI.
/// Compiled out of Release entirely.
enum DemoMode {

    static var requested: Bool { ProcessInfo.processInfo.arguments.contains("-CutOutDemo") }
    static var autoCut: Bool { ProcessInfo.processInfo.arguments.contains("-CutOutAutoCut") }

    /// `-CutOutShot n` puts the app into a fixed state for App Store screenshots.
    static var shot: Int? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-CutOutShot"), i + 1 < args.count else { return nil }
        return Int(args[i + 1])
    }

    static func script(forShot shot: Int) -> String? {
        switch shot {
        case 1: return "CutOut.setBand('v', 700, 940);"
        case 2: return "CutOut.setBand('v', 700, 940); CutOut.cut();"
        case 3: return "CutOut.setBand('h', 266, 354);"
        case 4: return "CutOut.setBand('v', 700, 940); CutOut.cut(); document.getElementById('btnGear').click();"
        default: return nil
        }
    }

    /// A believable expenses table: five columns with real borders, one of them
    /// obviously private, so a cut is easy to see and easy to verify.
    static func sampleTable(width: CGFloat = 1400, height: CGFloat = 900) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)

        let columns: [CGFloat] = [60, 400, 700, 940, 1180, 1340]
        let headers = ["Description", "Vendor", "Card ending", "Category", "Amount"]
        let rows: [[String]] = [
            ["Team offsite dinner", "Nusr-Et",        "•••• 4417", "Meals",    "AED 2,410"],
            ["Studio microphone",   "Sound Central",  "•••• 4417", "Hardware", "AED 1,180"],
            ["Domain renewals",     "Namecheap",      "•••• 8802", "Software", "AED 340"],
            ["Flight DXB → LHR",    "Emirates",       "•••• 4417", "Travel",   "AED 3,905"],
            ["Podcast editing",     "Upwork",         "•••• 8802", "Services", "AED 1,620"],
            ["Office chairs ×4",    "Home Centre",    "•••• 4417", "Fitout",   "AED 2,240"],
            ["Ring light",          "Amazon.ae",      "•••• 8802", "Hardware", "AED 289"],
        ]

        return renderer.pngData { context in
            let cg = context.cgContext
            cg.setFillColor(UIColor.white.cgColor)
            cg.fill(CGRect(x: 0, y: 0, width: width, height: height))

            let top: CGFloat = 90, rowHeight: CGFloat = 88
            let bottom = top + rowHeight * CGFloat(rows.count + 1)

            // header band
            cg.setFillColor(UIColor(white: 0.945, alpha: 1).cgColor)
            cg.fill(CGRect(x: columns[0], y: top, width: columns[5] - columns[0], height: rowHeight))

            // grid
            cg.setStrokeColor(UIColor(red: 0.60, green: 0.64, blue: 0.70, alpha: 1).cgColor)
            cg.setLineWidth(2)
            for x in columns { cg.move(to: CGPoint(x: x, y: top)); cg.addLine(to: CGPoint(x: x, y: bottom)) }
            for r in 0...(rows.count + 1) {
                let y = top + CGFloat(r) * rowHeight
                cg.move(to: CGPoint(x: columns[0], y: y)); cg.addLine(to: CGPoint(x: columns[5], y: y))
            }
            cg.strokePath()

            func draw(_ text: String, at point: CGPoint, size: CGFloat, weight: UIFont.Weight, color: UIColor) {
                (text as NSString).draw(at: point, withAttributes: [
                    .font: UIFont.systemFont(ofSize: size, weight: weight),
                    .foregroundColor: color,
                ])
            }

            draw("Q3 Expenses", at: CGPoint(x: columns[0], y: 26), size: 34, weight: .bold, color: .black)

            for (i, header) in headers.enumerated() {
                draw(header, at: CGPoint(x: columns[i] + 18, y: top + 28), size: 26, weight: .semibold, color: .black)
            }
            for (r, row) in rows.enumerated() {
                let y = top + rowHeight * CGFloat(r + 1) + 28
                for (i, cell) in row.enumerated() {
                    draw(cell, at: CGPoint(x: columns[i] + 18, y: y), size: 25, weight: .regular,
                         color: UIColor(white: 0.15, alpha: 1))
                }
            }
        }
    }
}
#endif
