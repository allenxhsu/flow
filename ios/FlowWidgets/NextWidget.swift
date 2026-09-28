import SwiftUI
import WidgetKit

/// Home screen, small and medium: stamina, mana, points, level and the next
/// task, exactly as the page last computed them (the snapshot in the app
/// group). Tapping the task opens Flow and starts its timer.
struct FlowNextWidget: Widget {
    let kind = "FlowNext"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            NextWidgetView(entry: entry)
                .containerBackground(Palette.panel, for: .widget)
        }
        .configurationDisplayName("Flow")
        .description("Stamina, mana, points and your next task.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: FlowSnapshot
    /// No snapshot yet: Flow has not run.
    let isPlaceholder: Bool
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .placeholder, isPlaceholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(current())
    }

    /// One entry; the app reloads the timeline whenever the page posts a new snapshot.
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        completion(Timeline(entries: [current()], policy: .never))
    }

    private func current() -> SnapshotEntry {
        if let s = SnapshotFile.read() { return SnapshotEntry(date: Date(), snapshot: s, isPlaceholder: false) }
        return SnapshotEntry(date: Date(), snapshot: .placeholder, isPlaceholder: true)
    }
}

struct NextWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private var snapshot: FlowSnapshot { entry.snapshot }
    private var startURL: URL {
        guard !entry.isPlaceholder, let next = snapshot.next, !next.id.isEmpty else { return FlowLink.app }
        return FlowLink.start(task: next.id)
    }

    var body: some View {
        Group {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 12) {
                    status.frame(maxWidth: .infinity, alignment: .leading)
                    Link(destination: startURL) { nextTask }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    status
                    Spacer(minLength: 0)
                    nextTask
                }
            }
        }
        .foregroundStyle(Palette.ink)
        .widgetURL(startURL)
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("LV \(snapshot.level)").font(.caption.bold())
                Spacer()
                Text("◆ \(Int(snapshot.points.rounded()))").font(.caption.bold().monospacedDigit())
                    .foregroundStyle(snapshot.points < 0 ? Palette.stamina : Palette.gem)
            }
            MeterRow(label: "Stamina", value: snapshot.stamina, tint: Palette.stamina)
            MeterRow(label: "Mana", value: snapshot.mana, tint: Palette.mana)
        }
    }

    private var nextTask: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("NEXT").font(.caption2.bold()).opacity(0.6)
            if let next = snapshot.next {
                Text(next.title).font(.subheadline.weight(.semibold)).lineLimit(family == .systemMedium ? 3 : 2)
                if let minutes = next.estimate {
                    Text("~\(Int(minutes.rounded())) min · tap to start").font(.caption2).opacity(0.7)
                }
            } else {
                Text("Nothing waiting").font(.subheadline).opacity(0.7)
            }
        }
    }
}

/// A 0–10 meter; unrated days show a dash.
struct MeterRow: View {
    let label: String
    let value: Double?
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label).font(.caption2)
                Spacer()
                Text(value.map { String(format: "%g", $0) } ?? "–").font(.caption2.monospacedDigit())
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Palette.ink.opacity(0.15))
                    Rectangle().fill(tint).frame(width: geo.size.width * CGFloat(min(10, max(0, value ?? 0)) / 10))
                }
            }
            .frame(height: 6)
            .overlay(Rectangle().stroke(Palette.ink, lineWidth: 1))
        }
    }
}
