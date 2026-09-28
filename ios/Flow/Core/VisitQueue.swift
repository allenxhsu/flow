import Foundation

/// Arrivals and departures at geofenced places, kept until the page has
/// written them (`flow.visits.ack`). Region events can come while Flow is
/// closed — iOS relaunches it in the background with no page loaded — so the
/// queue lives in the app's own UserDefaults and survives until acked.
///
/// Each entry is one `flow.visit` event: `{ id, place, arrive, leave }`,
/// place a Flow place id, times epoch milliseconds or null. An arrival is
/// sent at once with `leave: null` (the page writes the Drive moment it
/// implies); the departure sends the finished stay (the page writes the
/// visit). Nothing about where a place is goes in here.
final class VisitQueue {
    struct Entry: Codable, Equatable {
        var id: String
        var place: String
        var arrive: Int64?
        var leave: Int64?

        /// As the page gets it; null where a time is unknown.
        var event: [String: Any] {
            ["type": "flow.visit", "id": id, "place": place,
             "arrive": arrive.map { NSNumber(value: $0) } ?? NSNull(),
             "leave": leave.map { NSNumber(value: $0) } ?? NSNull()]
        }
    }

    private struct Stored: Codable {
        var pending: [Entry] = []
        /// place id → when the current stay began (ms).
        var open: [String: Int64] = [:]
    }

    private let defaults: UserDefaults
    private let key: String
    private let makeId: () -> String
    private var stored: Stored

    init(defaults: UserDefaults = .standard, key: String = "flow.visits", makeId: @escaping () -> String = { UUID().uuidString }) {
        self.defaults = defaults
        self.key = key
        self.makeId = makeId
        if let data = defaults.data(forKey: key), let s = try? JSONDecoder().decode(Stored.self, from: data) {
            stored = s
        } else {
            stored = Stored()
        }
    }

    /// Everything not yet acked, oldest first.
    var pending: [Entry] { stored.pending }

    /// Where a stay is open (arrived, not yet left).
    func isInside(_ place: String) -> Bool { stored.open[place] != nil }

    static func ms(_ date: Date) -> Int64 { Int64((date.timeIntervalSince1970 * 1000).rounded()) }

    /// Arrived at `place`: an open arrival for the page, and the stay begins.
    @discardableResult
    func arrive(_ place: String, at date: Date) -> Entry {
        let t = Self.ms(date)
        stored.open[place] = t
        let e = Entry(id: makeId(), place: place, arrive: t, leave: nil)
        stored.pending.append(e)
        save()
        return e
    }

    /// Left `place`: the finished stay (arrival nil when it was not seen).
    @discardableResult
    func leave(_ place: String, at date: Date) -> Entry {
        let arrive = stored.open.removeValue(forKey: place)
        let e = Entry(id: makeId(), place: place, arrive: arrive, leave: Self.ms(date))
        stored.pending.append(e)
        save()
        return e
    }

    /// The page wrote these: forget them. Unknown ids are ignored.
    func ack(_ ids: [String]) {
        let done = Set(ids)
        stored.pending.removeAll { done.contains($0.id) }
        save()
    }

    /// The place is no longer geofenced: an open stay there will never close.
    func forget(_ place: String) {
        stored.open.removeValue(forKey: place)
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(stored) { defaults.set(data, forKey: key) }
    }
}
