import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LogSubscriber as BaseLogSubscriber, NotificationEvent } from "@blazetrails/activesupport";
import { LogSubscriber } from "./log-subscriber.js";

class CaptureLogger {
  messages: string[] = [];
  info(msg: string): void {
    this.messages.push(msg);
  }
}

function makeEvent(payload: Record<string, unknown>, duration = 12): NotificationEvent {
  const ev = Object.create(NotificationEvent.prototype) as NotificationEvent;
  const fixedTime = new Date("2026-01-01T00:00:00Z");
  Object.assign(ev, {
    name: "redirect.action_dispatch",
    transactionId: "x",
    time: fixedTime,
    endTime: fixedTime,
    payload,
    children: [],
  });
  Object.defineProperty(ev, "duration", { value: duration, configurable: true });
  return ev;
}

describe("ActionDispatch::LogSubscriber#redirect", () => {
  let subscriber: LogSubscriber;
  let logger: CaptureLogger;

  beforeEach(() => {
    subscriber = new LogSubscriber();
    logger = new CaptureLogger();
    vi.spyOn(BaseLogSubscriber, "logger", "get").mockReturnValue(logger as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits Redirected-to and Completed-status lines", () => {
    subscriber.redirect(makeEvent({ location: "/posts", status: 302 }, 12));
    expect(logger.messages).toEqual(["Redirected to /posts", "Completed 302 Found in 12ms"]);
  });

  it("defaults status to 302 Found when missing", () => {
    subscriber.redirect(makeEvent({ location: "/x" }, 8));
    expect(logger.messages[1]).toBe("Completed 302 Found in 8ms");
  });

  it("handles permanent redirect (301)", () => {
    subscriber.redirect(makeEvent({ location: "/p", status: 301 }, 5));
    expect(logger.messages[1]).toBe("Completed 301 Moved Permanently in 5ms");
  });

  it("falls back to empty reason phrase for status not in Rack table", () => {
    subscriber.redirect(makeEvent({ location: "/x", status: 999 }, 1));
    expect(logger.messages[1]).toBe("Completed 999  in 1ms");
  });

  it("rounds non-integer duration", () => {
    subscriber.redirect(makeEvent({ location: "/r", status: 302 }, 3.7));
    expect(logger.messages[1]).toBe("Completed 302 Found in 4ms");
  });
});
