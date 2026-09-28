import Foundation

/// What the widget shows: the page's `flow.snapshot` message, as the page
/// computed it from play(). The widget never works out a rule itself.
struct FlowSnapshot: Codable, Equatable {
    struct Next: Codable, Equatable {
        var id: String
        var title: String
        var estimate: Double?
    }

    /// 0–10, nil before today's morning rating.
    var stamina: Double?
    var mana: Double?
    /// The points balance (can be below zero: debt).
    var points: Double
    var level: Int
    var next: Next?
    /// When the page took it, epoch milliseconds.
    var at: Double

    /// Shown before the app has ever run, and in the widget gallery.
    static let placeholder = FlowSnapshot(stamina: 7, mana: 6, points: 120, level: 3,
                                          next: Next(id: "", title: "Your next task", estimate: 30), at: 0)

    var date: Date { Date(timeIntervalSince1970: at / 1000) }

    /// From the page's message (`type` and any other keys are ignored). Nil
    /// when it is not a snapshot.
    init?(message: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message),
              let decoded = FlowSnapshot(json: data) else { return nil }
        self = decoded
    }

    init?(json: Data) {
        guard let decoded = try? JSONDecoder().decode(FlowSnapshot.self, from: json) else { return nil }
        self = decoded
    }

    init(stamina: Double?, mana: Double?, points: Double, level: Int, next: Next?, at: Double) {
        self.stamina = stamina
        self.mana = mana
        self.points = points
        self.level = level
        self.next = next
        self.at = at
    }

    func json() -> Data {
        (try? JSONEncoder().encode(self)) ?? Data()
    }
}

/// The snapshot's file in the shared container.
enum SnapshotFile {
    static let name = "flow-snapshot.json"

    static func url(in folder: URL = AppGroup.folder) -> URL {
        folder.appendingPathComponent(name)
    }

    static func read(from folder: URL = AppGroup.folder) -> FlowSnapshot? {
        guard let data = try? Data(contentsOf: url(in: folder)) else { return nil }
        return FlowSnapshot(json: data)
    }

    @discardableResult
    static func write(_ snapshot: FlowSnapshot, to folder: URL = AppGroup.folder) -> Bool {
        do {
            try snapshot.json().write(to: url(in: folder), options: .atomic)
            return true
        } catch {
            return false
        }
    }
}
