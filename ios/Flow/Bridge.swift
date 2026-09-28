import Foundation
import ToolkitShell

/// The page this app talks to. A handler gets the page with each message;
/// the app keeps it so region events and Health answers, which arrive on
/// their own schedule, can reach the page too. Before the page has posted
/// anything there is no page, and events wait in their own queues.
@MainActor
final class Bridge {
    static let shared = Bridge()
    private(set) var page: (any ShellPage)?

    func attach(_ page: any ShellPage) {
        self.page = page
    }

    /// `window.flowHost.event(event)`, when there is a page.
    func send(_ event: [String: Any]) {
        page?.send(event)
    }
}

/// The page → app messages (src/native.js TO_APP). Each is small: the work is
/// in TimerActivity, SnapshotStore, Places and Health.
enum FlowHandlers {
    static var all: [String: ShellHandler] {
        [
            "flow.timer": { message, page in
                Bridge.shared.attach(page)
                TimerActivity.apply(message)
            },
            "flow.snapshot": { message, page in
                Bridge.shared.attach(page)
                SnapshotStore.save(message)
            },
            "flow.geofence.set": { message, page in
                Bridge.shared.attach(page)
                if let place = placeId(message) { Places.shared.set(place, name: placeName(message)) }
            },
            "flow.geofence.clear": { message, page in
                Bridge.shared.attach(page)
                if let place = placeId(message) { Places.shared.clear(place) }
            },
            "flow.geofence.list": { _, page in
                // Sent when the page starts: a fresh page gets every visit not yet written.
                Bridge.shared.attach(page)
                Places.shared.sendStatus()
                Places.shared.sendPendingVisits()
            },
            "flow.health.request": { _, page in
                Bridge.shared.attach(page)
                Health.shared.request()
            },
            "flow.visits.ack": { message, page in
                Bridge.shared.attach(page)
                let ids = (message["ids"] as? [Any])?.compactMap { $0 as? String } ?? []
                Places.shared.ack(ids)
            },
        ]
    }

    private static func placeId(_ message: [String: Any]) -> String? {
        let id = (message["place"] as? [String: Any])?["id"] as? String
        return id?.isEmpty == false ? id : nil
    }

    private static func placeName(_ message: [String: Any]) -> String {
        (message["place"] as? [String: Any])?["name"] as? String ?? ""
    }
}
