import Foundation

/// The places marked on this iPhone, with where they are. Stored ONLY in the
/// app's own UserDefaults: never in the app group, never sent to the page
/// (which sees place ids), never in a record, a log or a repository.
final class GeofenceBook {
    struct Fence: Codable, Equatable {
        var name: String
        var latitude: Double
        var longitude: Double
        var radius: Double
    }

    /// Region identifiers carry the place id so a region event names its place.
    static let prefix = "flow.place."
    static func regionId(_ place: String) -> String { prefix + place }
    static func place(fromRegion id: String) -> String? {
        id.hasPrefix(prefix) ? String(id.dropFirst(prefix.count)) : nil
    }

    /// Smallest radius worth monitoring: iOS region events are coarse below it.
    static let minimumRadius: Double = 100

    private let defaults: UserDefaults
    private let key: String
    private(set) var fences: [String: Fence]

    init(defaults: UserDefaults = .standard, key: String = "flow.geofences") {
        self.defaults = defaults
        self.key = key
        if let data = defaults.data(forKey: key), let f = try? JSONDecoder().decode([String: Fence].self, from: data) {
            fences = f
        } else {
            fences = [:]
        }
    }

    func set(_ place: String, _ fence: Fence) {
        var f = fence
        f.radius = max(Self.minimumRadius, fence.radius)
        fences[place] = f
        save()
    }

    func clear(_ place: String) {
        fences.removeValue(forKey: place)
        save()
    }

    /// What the page may know: `{ authorized, places: [{ id, set }] }`, ids only.
    func status(authorized: Bool) -> [String: Any] {
        ["type": "flow.geofence.status", "authorized": authorized,
         "places": fences.keys.sorted().map { ["id": $0, "set": true] as [String: Any] }]
    }

    private func save() {
        if let data = try? JSONEncoder().encode(fences) { defaults.set(data, forKey: key) }
    }
}
