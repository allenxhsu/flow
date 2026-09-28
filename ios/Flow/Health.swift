import Foundation
import HealthKit

/// Apple Health, read-only: last night's sleep and yesterday's steps, sent to
/// the page as `flow.health` for the morning rating's suggestion. Nothing is
/// written to Health, and nothing read is stored here or in Flow's records.
/// Refused or unavailable, the event carries nulls and the page shows no
/// suggestion.
@MainActor
final class Health {
    static let shared = Health()
    private let store = HKHealthStore()
    private init() {}

    func request() {
        let now = Date()
        let day = HealthMath.day(now)
        guard HKHealthStore.isHealthDataAvailable(),
              let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
              let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            send(day: day, sleepHours: nil, steps: nil)
            return
        }
        store.requestAuthorization(toShare: [], read: [sleep, steps]) { _, _ in
            Task { @MainActor in
                let hours = await self.sleepHours(sleep, now: now)
                let count = await self.steps(steps, now: now)
                self.send(day: day, sleepHours: hours, steps: count)
            }
        }
    }

    private func send(day: String, sleepHours: Double?, steps: Double?) {
        Bridge.shared.send([
            "type": "flow.health", "day": day,
            "sleepHours": sleepHours.map { NSNumber(value: $0) } ?? NSNull(),
            "steps": steps.map { NSNumber(value: $0.rounded()) } ?? NSNull(),
        ])
    }

    /// Asleep samples of last night (any stage), overlaps counted once.
    private func sleepHours(_ type: HKCategoryType, now: Date) async -> Double? {
        let window = HealthMath.lastNight(before: now)
        let predicate = HKQuery.predicateForSamples(withStart: window.start, end: window.end, options: [])
        let asleep: Set<Int> = [
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
            HKCategoryValueSleepAnalysis.asleepCore.rawValue,
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
            HKCategoryValueSleepAnalysis.asleepREM.rawValue,
        ]
        let intervals: [DateInterval] = await withCheckedContinuation { done in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                let list = (samples as? [HKCategorySample] ?? [])
                    .filter { asleep.contains($0.value) && $0.endDate > $0.startDate }
                    .map { DateInterval(start: $0.startDate, end: $0.endDate) }
                done.resume(returning: list)
            }
            store.execute(query)
        }
        return HealthMath.sleepHours(intervals, within: window)
    }

    /// Yesterday's step count, or nil with no data.
    private func steps(_ type: HKQuantityType, now: Date) async -> Double? {
        let window = HealthMath.yesterday(before: now)
        let predicate = HKQuery.predicateForSamples(withStart: window.start, end: window.end, options: .strictStartDate)
        return await withCheckedContinuation { done in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                done.resume(returning: stats?.sumQuantity()?.doubleValue(for: .count()))
            }
            store.execute(query)
        }
    }
}
