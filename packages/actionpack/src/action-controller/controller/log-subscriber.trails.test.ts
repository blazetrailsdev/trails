/**
 * trails-only coverage for `start_processing`'s params and format branches
 * (`vendor/rails/actionpack/lib/action_controller/log_subscriber.rb:9-27`).
 * Rails reaches them through a real controller request, so its own
 * `ACLogSubscriberTest` asserts only the `Processing by` line; these drive the
 * payload directly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent,
  Notifications,
} from "@blazetrails/activesupport";
import { LogSubscriber } from "../log-subscriber.js";

class CaptureLogger {
  messages: string[] = [];
  get "info?"(): boolean {
    return true;
  }
  info(msg: string | (() => string)): void {
    this.messages.push(typeof msg === "function" ? msg() : msg);
  }
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

  function startProcessing(payload: Record<string, unknown>): void {
    subscriber.startProcessing(
      new NotificationEvent("start_processing.action_controller", 0, 0.01, "x", {
        controller: "Another::LogSubscribersController",
        action: "show",
        params: {},
        ...payload,
      }),
    );
  }

  it("start processing logs the filtered parameters", () => {
    startProcessing({ params: { id: "1", name: "alice" }, format: ":html" });
    expect(logger.messages[1]).toBe('  Parameters: {"id"=>"1", "name"=>"alice"}');
  });

  it("start processing omits the parameters line when only internal params remain", () => {
    startProcessing({
      params: { controller: "c", action: "a", format: "json", _method: "put", only_path: "1" },
      format: ":json",
    });
    expect(logger.messages.length).toBe(1);
  });

  it("start processing upcases a Symbol format and leaves a String one", () => {
    startProcessing({ format: ":html" });
    startProcessing({ format: "text/plain" });
    expect(logger.messages).toEqual([
      "Processing by Another::LogSubscribersController#show as HTML",
      "Processing by Another::LogSubscribersController#show as text/plain",
    ]);
  });
});
