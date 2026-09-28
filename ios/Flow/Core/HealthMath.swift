import Foundation

/// The arithmetic behind the `flow.health` event, apart from HealthKit so it
/// can be tested: which night, which day, and how long asleep.
enum HealthMath {
    /// 'YYYY-MM-DD' in the person's own calendar, as the page's dayOf.
    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        func pad(_ n: Int?, _ width: Int) -> String {
            let s = String(n ?? 0)
            return String(repeating: "0", count: max(0, width - s.count)) + s
        }
        return "\(pad(c.year, 4))-\(pad(c.month, 2))-\(pad(c.day, 2))"
    }

    /// Last night: from 18:00 yesterday to 14:00 today.
    static func lastNight(before now: Date, calendar: Calendar = .current) -> DateInterval {
        let today = calendar.startOfDay(for: now)
        let from = calendar.date(byAdding: .hour, value: -6, to: today) ?? today
        let to = calendar.date(byAdding: .hour, value: 14, to: today) ?? now
        return DateInterval(start: from, end: max(from, min(to, now)))
    }

    /// Yesterday, midnight to midnight.
    static func yesterday(before now: Date, calendar: Calendar = .current) -> DateInterval {
        let today = calendar.startOfDay(for: now)
        let from = calendar.date(byAdding: .day, value: -1, to: today) ?? today
        return DateInterval(start: from, end: today)
    }

    /// Hours asleep in `window`: the union of the asleep intervals, so a watch
    /// and a phone both recording the same night count it once. Nil when
    /// there is nothing (no data, or reading was not allowed).
    static func sleepHours(_ intervals: [DateInterval], within window: DateInterval) -> Double? {
        let clipped = intervals.compactMap { $0.intersection(with: window) }.filter { $0.duration > 0 }
            .sorted { $0.start < $1.start }
        guard !clipped.isEmpty else { return nil }
        var total: TimeInterval = 0
        var current = clipped[0]
        for next in clipped.dropFirst() {
            if next.start <= current.end {
                current = DateInterval(start: current.start, end: max(current.end, next.end))
            } else {
                total += current.duration
                current = next
            }
        }
        total += current.duration
        return (total / 3600 * 100).rounded() / 100
    }
}
