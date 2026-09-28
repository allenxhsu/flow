import ActivityKit
import SwiftUI
import WidgetKit

/// The running timer on the Lock Screen and in the Dynamic Island: the task,
/// the time since it started and its place. Finish opens Flow at Log done
/// for the task; the page fills in the timer's minutes (value and quality
/// are still the player's to confirm).
struct FlowTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlowTimerAttributes.self) { context in
            LockScreenTimerView(context: context)
                .activityBackgroundTint(Palette.panel)
                .activitySystemActionForegroundColor(Palette.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Flow", systemImage: "timer").font(.caption).foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.state.start...Date.distantFuture, countsDown: false)
                        .monospacedDigit().font(.title3.bold()).multilineTextAlignment(.trailing)
                        .frame(maxWidth: 110)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if let place = context.attributes.place {
                            Label(place, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Link(destination: FlowLink.done(task: context.attributes.taskId)) {
                            Label("Finish", systemImage: "checkmark.circle.fill").font(.callout.bold())
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                Text(timerInterval: context.state.start...Date.distantFuture, countsDown: false)
                    .monospacedDigit().frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "timer")
            }
            .widgetURL(FlowLink.app)
        }
    }
}

struct LockScreenTimerView: View {
    let context: ActivityViewContext<FlowTimerAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.title).font(.headline).lineLimit(2)
                if let place = context.attributes.place {
                    Label(place, systemImage: "mappin").font(.caption)
                }
                Text(timerInterval: context.state.start...Date.distantFuture, countsDown: false)
                    .font(.title2.bold()).monospacedDigit()
            }
            .foregroundStyle(Palette.ink)
            Spacer()
            Link(destination: FlowLink.done(task: context.attributes.taskId)) {
                Label("Finish", systemImage: "checkmark")
                    .font(.callout.bold())
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Palette.ink)
                    .foregroundStyle(Palette.panel)
            }
        }
        .padding(16)
    }
}
