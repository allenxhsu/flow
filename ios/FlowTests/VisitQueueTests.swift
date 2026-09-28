import XCTest

/// Arrive / leave events wait here until the page has written them.
final class VisitQueueTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suite = "flow.tests.\(UUID().uuidString)"
    private var counter = 0

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suite)
        counter = 0
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private func queue() -> VisitQueue {
        VisitQueue(defaults: defaults, key: "visits") { [unowned self] in
            self.counter += 1
            return "q\(self.counter)"
        }
    }

    private let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    func testAnArrivalIsSentOpenAndTheDepartureCarriesTheStay() {
        let q = queue()
        let a = q.arrive("place_desk", at: t0)
        XCTAssertEqual(a, VisitQueue.Entry(id: "q1", place: "place_desk", arrive: 1_790_000_000_000, leave: nil))
        XCTAssertTrue(q.isInside("place_desk"))
        let l = q.leave("place_desk", at: t0.addingTimeInterval(3600))
        XCTAssertEqual(l, VisitQueue.Entry(id: "q2", place: "place_desk", arrive: 1_790_000_000_000, leave: 1_790_003_600_000))
        XCTAssertFalse(q.isInside("place_desk"))
        XCTAssertEqual(q.pending.map(\.id), ["q1", "q2"])
    }

    func testTheEventIsWhatThePageReads() {
        let q = queue()
        let e = q.leave("place_gym", at: t0).event
        XCTAssertEqual(e["type"] as? String, "flow.visit")
        XCTAssertEqual(e["id"] as? String, "q1")
        XCTAssertEqual(e["place"] as? String, "place_gym")
        XCTAssertTrue(e["arrive"] is NSNull, "an arrival not seen is null")
        XCTAssertEqual((e["leave"] as? NSNumber)?.int64Value, 1_790_000_000_000)
        XCTAssertTrue(JSONSerialization.isValidJSONObject(e))
        XCTAssertEqual(Set(e.keys), ["type", "id", "place", "arrive", "leave"], "no coordinates")
    }

    func testItSurvivesARelaunchUntilAcked() {
        let first = queue()
        first.arrive("place_desk", at: t0)
        first.leave("place_desk", at: t0.addingTimeInterval(60))
        first.arrive("place_gym", at: t0.addingTimeInterval(120))

        let again = queue()   // the app was relaunched in the background
        XCTAssertEqual(again.pending.map(\.id), ["q1", "q2", "q3"])
        XCTAssertTrue(again.isInside("place_gym"))
        again.ack(["q1", "q3", "unknown"])
        XCTAssertEqual(again.pending.map(\.id), ["q2"])
        again.ack(["q2"])
        XCTAssertTrue(queue().pending.isEmpty)
    }

    func testClearingAPlaceForgetsItsOpenStay() {
        let q = queue()
        q.arrive("place_desk", at: t0)
        q.forget("place_desk")
        XCTAssertFalse(q.isInside("place_desk"))
        XCTAssertNil(q.leave("place_desk", at: t0.addingTimeInterval(60)).arrive)
    }
}
