import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// The Live Activity for Flow's timer: what does not change while it runs
/// (the task, its place) and what does (only the start, should the page
/// restart it on the same task).
struct FlowTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var start: Date
    }

    var taskId: String
    var title: String
    /// The place's name, or nil for a task with none.
    var place: String?
}
#endif
