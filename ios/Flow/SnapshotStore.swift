import Foundation
import WidgetKit

/// Keeps the widget's numbers: the page's `flow.snapshot`, written to the
/// app group, then the widget told to redraw. The widget only reads it.
@MainActor
enum SnapshotStore {
    static func save(_ message: [String: Any]) {
        guard let snapshot = FlowSnapshot(message: message) else {
            NSLog("Flow: a flow.snapshot that does not decode was ignored")
            return
        }
        if SnapshotFile.read() == snapshot { return }
        if SnapshotFile.write(snapshot) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
