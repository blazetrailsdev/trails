import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent,
  Notifications,
} from "@blazetrails/activesupport";
import { LogSubscriber } from "../log-subscriber.js";

class CaptureLogger {
  messages: string[] = [];
  info(msg: string): void {
    this.messages.push(msg);
  }
}

function makeEvent(
  name: string,
  payload: Record<string, unknown>,
  duration = 10,
): NotificationEvent {
  const ev = Object.create(NotificationEvent.prototype) as NotificationEvent;
  const fixedTime = new Date("2026-01-01T00:00:00Z");
  Object.assign(ev, {
    name,
    transactionId: "x",
    time: fixedTime,
    endTime: fixedTime,
    payload,
    children: [],
  });
  Object.defineProperty(ev, "duration", { value: duration, configurable: true });
  return ev;
}

describe("ACLogSubscriberTest", () => {
  let subscriber: LogSubscriber;
  let logger: CaptureLogger;

  beforeEach(() => {
    subscriber = new LogSubscriber();
    logger = new CaptureLogger();
    vi.spyOn(BaseLogSubscriber, "logger", "get").mockReturnValue(logger as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
  });

  it("start processing", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        format: "HTML",
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as HTML");
  });

  it("start processing as json", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        format: "JSON",
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as JSON");
  });

  it("start processing as non exten", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        format: undefined,
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as */*");
  });

  it("halted callback", () => {
    subscriber.haltedCallback(
      makeEvent("halted_callback.action_controller", { filter: ":redirector" }),
    );
    expect(logger.messages[0]).toBe('Filter chain halted as ":redirector" rendered or redirected');
  });

  it("process action", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 200 }, 42));
    expect(logger.messages[0]).toMatch(/Completed/);
    expect(logger.messages[0]).toMatch(/200 OK/);
  });

  it("process action without parameters", () => {
    // Parameters line is emitted by dispatch middleware, not the subscriber itself.
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 200 }, 5));
    expect(logger.messages.every((m) => !/Parameters/.test(m))).toBe(true);
  });

  it.skip("process action with parameters", () => {});
  it.skip("multiple process with parameters", () => {});
  it.skip("process action with wrapped parameters", () => {});

  it("process action with view runtime", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 200 }, 37));
    expect(logger.messages[0]).toMatch(/Completed 200 OK in \d+ms/);
  });

  it.skip("process action with path", () => {});
  it.skip("process action with throw", () => {});
  it.skip("append info to payload is called even with exception", () => {});
  it.skip("process action headers", () => {});
  it.skip("process action with filter parameters", () => {});

  it("redirect to", () => {
    subscriber.redirectTo(
      makeEvent("redirect_to.action_controller", { location: "http://foo.bar/" }),
    );
    expect(logger.messages[0]).toBe("Redirected to http://foo.bar/");
  });

  it.skip("filter redirect url by string", () => {});
  it.skip("filter redirect url by regexp", () => {});
  it.skip("does not filter redirect params by default", () => {});
  it.skip("filter redirect params by string", () => {});
  it.skip("filter redirect params by regexp", () => {});
  it.skip("filter redirect bad uri", () => {});

  it("send data", () => {
    subscriber.sendData(makeEvent("send_data.action_controller", { filename: "file.txt" }));
    expect(logger.messages[0]).toMatch(/Sent data file\.txt/);
  });

  it("send file", () => {
    subscriber.sendFile(makeEvent("send_file.action_controller", { path: "/fixtures/company.rb" }));
    expect(logger.messages[0]).toMatch(/Sent file/);
    expect(logger.messages[0]).toMatch(/company\.rb/);
  });

  it.skip("with fragment cache", () => {});
  it.skip("with fragment cache when log disabled", () => {});
  it.skip("with fragment cache if with true", () => {});
  it.skip("with fragment cache if with false", () => {});
  it.skip("with fragment cache unless with true", () => {});
  it.skip("with fragment cache unless with false", () => {});
  it.skip("with fragment cache and percent in key", () => {});

  it("process action with exception includes http status code", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 500 }, 5));
    expect(logger.messages[0]).toMatch(/Completed 500/);
    expect(logger.messages[0]).toMatch(/Internal Server Error/);
  });

  it("process action with rescued exception includes http status code", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 406 }, 5));
    expect(logger.messages[0]).toMatch(/Completed 406/);
    expect(logger.messages[0]).toMatch(/Not Acceptable/);
  });

  it("process action with with action not found logs 404", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 404 }, 5));
    expect(logger.messages[0]).toMatch(/Completed 404/);
    expect(logger.messages[0]).toMatch(/Not Found/);
  });
});
