import Foundation
import CoreLocation

/// Arrive / leave at the places the player marked in Settings ▸ Places on
/// this iPhone. The location is read once, to mark a place, and then iOS
/// watches the circle around it (region monitoring, which needs "Always");
/// crossing it queues a `flow.visit` for the page.
///
/// Privacy: where a place is lives only in GeofenceBook (this app's own
/// UserDefaults). The page, the records, the sync and the logs only ever
/// see the place's Flow id.
@MainActor
final class Places: NSObject, CLLocationManagerDelegate {
    static let shared = Places()

    private let manager = CLLocationManager()
    private let book = GeofenceBook()
    private let queue = VisitQueue()
    /// Places waiting for the one location fix that marks them.
    private var marking: [String: String] = [:]
    private var started = false

    override private init() {
        super.init()
    }

    func start() {
        guard !started else { return }
        started = true
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    private var authorized: Bool {
        let s = manager.authorizationStatus
        return s == .authorizedAlways || s == .authorizedWhenInUse
    }

    // MARK: Page requests

    /// "Set to where I am now": ask for permission if need be, then one fix.
    func set(_ place: String, name: String) {
        start()
        marking[place] = name
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()   // the fix follows in locationManagerDidChangeAuthorization
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()      // arrive / leave while Flow is closed needs Always
            manager.requestLocation()
        case .authorizedAlways:
            manager.requestLocation()
        default:
            marking.removeValue(forKey: place)
            sendStatus()
        }
    }

    func clear(_ place: String) {
        start()
        for region in manager.monitoredRegions where region.identifier == GeofenceBook.regionId(place) {
            manager.stopMonitoring(for: region)
        }
        book.clear(place)
        queue.forget(place)
        sendStatus()
    }

    func sendStatus() {
        Bridge.shared.send(book.status(authorized: authorized))
    }

    /// Every visit not yet written, oldest first. The page skips what it already has.
    func sendPendingVisits() {
        for entry in queue.pending { Bridge.shared.send(entry.event) }
    }

    func ack(_ ids: [String]) {
        queue.ack(ids)
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            if !marking.isEmpty {
                switch manager.authorizationStatus {
                case .authorizedWhenInUse:
                    manager.requestAlwaysAuthorization()
                    manager.requestLocation()
                case .authorizedAlways:
                    manager.requestLocation()
                case .denied, .restricted:
                    marking.removeAll()
                default:
                    break
                }
            }
            sendStatus()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let fix = locations.last else { return }
        MainActor.assumeIsolated { mark(at: fix) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            NSLog("Flow: no location fix to mark a place")
            marking.removeAll()
            sendStatus()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        // didDetermineState(.inside) may have come first for the same crossing: one arrival, not two.
        MainActor.assumeIsolated {
            guard let place = GeofenceBook.place(fromRegion: region.identifier), book.fences[place] != nil,
                  !queue.isInside(place) else { return }
            Bridge.shared.send(queue.arrive(place, at: Date()).event)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        MainActor.assumeIsolated {
            guard let place = GeofenceBook.place(fromRegion: region.identifier), book.fences[place] != nil else { return }
            Bridge.shared.send(queue.leave(place, at: Date()).event)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        // Marking a place while standing in it: the stay begins now, so the
        // departure has an arrival (and no Drive is invented for it).
        MainActor.assumeIsolated {
            guard state == .inside, let place = GeofenceBook.place(fromRegion: region.identifier),
                  book.fences[place] != nil, !queue.isInside(place) else { return }
            Bridge.shared.send(queue.arrive(place, at: Date()).event)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        NSLog("Flow: a place could not be monitored")
    }

    // MARK: Marking

    private func mark(at fix: CLLocation) {
        guard !marking.isEmpty else { return }
        let places = marking
        marking.removeAll()
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
            sendStatus()
            return
        }
        for (place, name) in places {
            let radius = min(max(GeofenceBook.minimumRadius, fix.horizontalAccuracy * 2), manager.maximumRegionMonitoringDistance)
            book.set(place, GeofenceBook.Fence(name: name, latitude: fix.coordinate.latitude,
                                               longitude: fix.coordinate.longitude, radius: radius))
            let region = CLCircularRegion(center: fix.coordinate, radius: radius, identifier: GeofenceBook.regionId(place))
            region.notifyOnEntry = true
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
            manager.requestState(for: region)
        }
        sendStatus()
    }
}
