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

  it("every logging method registers the level its subscribe_log_level names", () => {
    const silencedBy = (logger: Record<string, boolean>): string[] =>
      [...LogSubscriber.logLevels]
        .filter(([, check]) => check(logger as never))
        .map(([method]) => method);

    expect(silencedBy({ "info?": false, "debug?": true, "error?": true })).toEqual([
      "start_processing",
      "process_action",
      "halted_callback",
      "send_file",
      "redirect_to",
      "send_data",
    ]);
    expect(silencedBy({ "info?": true, "debug?": false, "error?": true })).toEqual([
      "unpermitted_parameters",
    ]);
  });
});
