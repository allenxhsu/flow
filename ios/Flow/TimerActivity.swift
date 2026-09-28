import Foundation
import ActivityKit

/// The Lock Screen and Dynamic Island timer. The page posts `flow.timer`
/// whenever its timer starts or ends; this keeps exactly one Live Activity
/// in step with it. With Live Activities turned off for Flow, nothing
/// happens and the page's own timer runs as it always did.
@MainActor
enum TimerActivity {
    static func apply(_ message: [String: Any]) {
        let state = message["state"] as? String
        let task = message["task"] as? [String: Any]
        guard state == "running",
              let id = task?["id"] as? String,
              let startMs = (message["start"] as? NSNumber)?.doubleValue else {
            endAll()
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let title = task?["title"] as? String ?? "Timer"
        let place = task?["place"] as? String

        var keep = false
        for activity in Activity<FlowTimerAttributes>.activities {
            if activity.attributes.taskId == id, activity.content.state.start == start, !keep {
                keep = true
            } else {
                end(activity)
            }
        }
        guard !keep, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = FlowTimerAttributes(taskId: id, title: title, place: place)
        let content = ActivityContent(state: FlowTimerAttributes.ContentState(start: start), staleDate: nil)
        do {
            _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
        } catch {
            NSLog("Flow: could not start the Live Activity: %@", error.localizedDescription)
        }
    }

    static func endAll() {
        for activity in Activity<FlowTimerAttributes>.activities { end(activity) }
    }

    private static func end(_ activity: Activity<FlowTimerAttributes>) {
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}
