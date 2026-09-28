import SwiftUI
import WidgetKit

/// Flow's widget extension: the home-screen widget and the timer's Live Activity.
@main
struct FlowWidgets: WidgetBundle {
    var body: some Widget {
        FlowNextWidget()
        FlowTimerLiveActivity()
    }
}
