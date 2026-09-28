import XCTest

/// The widget's snapshot, as the page posts it (src/native.js snapshotOf).
final class SnapshotTests: XCTestCase {
    private func message(_ extra: [String: Any] = [:]) -> [String: Any] {
        var m: [String: Any] = [
            "type": "flow.snapshot", "stamina": 6.5, "mana": 7, "points": -40, "level": 3,
            "next": ["id": "task_abc", "title": "Mail", "estimate": 25], "at": 1_790_561_866_169,
        ]
        for (k, v) in extra { m[k] = v }
        return m
    }

    func testDecodesThePagesMessage() throws {
        let s = try XCTUnwrap(FlowSnapshot(message: message()))
        XCTAssertEqual(s.stamina, 6.5)
        XCTAssertEqual(s.mana, 7)
        XCTAssertEqual(s.points, -40, "debt shows as it is")
        XCTAssertEqual(s.level, 3)
        XCTAssertEqual(s.next, FlowSnapshot.Next(id: "task_abc", title: "Mail", estimate: 25))
        XCTAssertEqual(s.at, 1_790_561_866_169)
        XCTAssertEqual(s.date.timeIntervalSince1970, 1_790_561_866.169, accuracy: 0.001)
    }

    func testAnUnratedDayAndNothingNextAreNulls() throws {
        let s = try XCTUnwrap(FlowSnapshot(message: message(["stamina": NSNull(), "mana": NSNull(), "next": NSNull()])))
        XCTAssertNil(s.stamina)
        XCTAssertNil(s.mana)
        XCTAssertNil(s.next)
    }

    func testANextTaskWithNoEstimate() throws {
        let s = try XCTUnwrap(FlowSnapshot(message: message(["next": ["id": "t", "title": "T", "estimate": NSNull()]])))
        XCTAssertEqual(s.next?.estimate, nil)
    }

    func testSomethingElseIsNotASnapshot() {
        XCTAssertNil(FlowSnapshot(message: ["type": "flow.snapshot"]))
        XCTAssertNil(FlowSnapshot(message: message(["level": "three"])))
        XCTAssertNil(FlowSnapshot(json: Data("not json".utf8)))
    }

    func testRoundTripsThroughTheSharedFile() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("flow-snap-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        XCTAssertNil(SnapshotFile.read(from: folder), "nothing written yet: the widget shows its placeholder")
        let s = try XCTUnwrap(FlowSnapshot(message: message()))
        XCTAssertTrue(SnapshotFile.write(s, to: folder))
        XCTAssertEqual(SnapshotFile.read(from: folder), s)
    }
}
