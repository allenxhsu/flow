import XCTest

/// The links the Live Activity and the widget open Flow with; the page
/// parses them (src/native.js parseDeepLink).
final class DeepLinkTests: XCTestCase {
    func testFinishOpensLogDone() {
        XCTAssertEqual(FlowLink.done(task: "task_abc", minutes: 42).absoluteString, "flow://done?task=task_abc&minutes=42")
        XCTAssertEqual(FlowLink.done(task: "task_abc").absoluteString, "flow://done?task=task_abc",
                       "without minutes the page takes its running timer's")
        XCTAssertEqual(FlowLink.done(task: "task_abc", minutes: 0).absoluteString, "flow://done?task=task_abc&minutes=1")
    }

    func testTheWidgetsTaskStartsTheTimer() {
        XCTAssertEqual(FlowLink.start(task: "task_pl_plan_web_t1").absoluteString, "flow://start?task=task_pl_plan_web_t1")
    }

    func testIdsAreEscaped() {
        let url = FlowLink.start(task: "a b&c=d+e")
        XCTAssertEqual(url.absoluteString, "flow://start?task=a%20b%26c%3Dd%2Be")
        let back = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "task" }?.value
        XCTAssertEqual(back, "a b&c=d+e")
    }

    func testMinutesAreWholeAndAtLeastOne() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertEqual(FlowLink.minutes(from: start, to: start.addingTimeInterval(10)), 1)
        XCTAssertEqual(FlowLink.minutes(from: start, to: start.addingTimeInterval(25 * 60 + 29)), 25)
        XCTAssertEqual(FlowLink.minutes(from: start, to: start.addingTimeInterval(25 * 60 + 31)), 26)
    }
}
