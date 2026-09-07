import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LogSubscriber as BaseLogSubscriber,
  MemoryStore,
  NotificationEvent,
  Notifications,
} from "@blazetrails/activesupport";
import { Base as ActionViewBase, type CacheHelperHost } from "@blazetrails/actionview";
import { LogSubscriber } from "../log-subscriber.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import type { CachingClassMethods } from "../../abstract-controller/caching.js";

type CachingView = ActionViewBase & CacheHelperHost;

function renderInline(controller: Base, block: (view: CachingView) => void): void {
  const view = new ActionViewBase(null, {}, controller) as CachingView;
  block(view);
  controller.render({ plain: view.outputBuffer.toStr() });
}

class LogSubscribersController extends Base {
  async withFragmentCache() {
    renderInline(this, (view) => {
      view.cache("foo", {}, () => {
        view.outputBuffer.append("bar");
      });
    });
  }

  async withFragmentCacheAndPercentInKey() {
    renderInline(this, (view) => {
      view.cache("foo%bar", {}, () => {
        view.outputBuffer.append("Contains % sign in key");
      });
    });
  }

  async withFragmentCacheIfWithTrueCondition() {
    renderInline(this, (view) => {
      view.cacheIf(true, "foo", {}, () => {
        view.outputBuffer.append("bar");
      });
    });
  }

  async withFragmentCacheIfWithFalseCondition() {
    renderInline(this, (view) => {
      view.cacheIf(false, "foo", {}, () => {
        view.outputBuffer.append("bar");
      });
    });
  }

  async withFragmentCacheUnlessWithFalseCondition() {
    renderInline(this, (view) => {
      view.cacheUnless(false, "foo", {}, () => {
        view.outputBuffer.append("bar");
      });
    });
  }

  async withFragmentCacheUnlessWithTrueCondition() {
    renderInline(this, (view) => {
      view.cacheUnless(true, "foo", {}, () => {
        view.outputBuffer.append("bar");
      });
    });
  }
}

Object.defineProperty(LogSubscribersController, "name", {
  value: "Another::LogSubscribersController",
});

class CaptureLogger {
  messages: string[] = [];
  get "info?"(): boolean {
    return true;
  }
  info(msg: string | (() => string)): void {
    this.messages.push(typeof msg === "function" ? msg() : msg);
  }
}

function makeEvent(
  name: string,
  payload: Record<string, unknown>,
  duration = 10,
): NotificationEvent {
  return new NotificationEvent(name, 0, duration / 1000.0, "x", payload);
}

describe("ACLogSubscriberTest", () => {
  let subscriber: LogSubscriber;
  let logger: CaptureLogger;
  let controller: TestCase;
  let logs: string[];
  let oldEnableFragmentCacheLogging: boolean;

  beforeEach(() => {
    subscriber = new LogSubscriber();
    logger = new CaptureLogger();
    logs = logger.messages;
    vi.spyOn(BaseLogSubscriber, "logger", "get").mockReturnValue(logger as never);

    const caching = Base as unknown as CachingClassMethods;
    oldEnableFragmentCacheLogging = caching.enableFragmentCacheLogging!;
    caching.enableFragmentCacheLogging = true;

    controller = new TestCase(LogSubscribersController);
    const controllerClass = LogSubscribersController as unknown as CachingClassMethods;
    controllerClass.cacheStore = new MemoryStore();
    controllerClass.performCaching = true;
    Notifications.unsubscribeAll();
    LogSubscriber.attachTo("action_controller");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging =
      oldEnableFragmentCacheLogging;
  });

  it("start processing", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        params: { controller: "another/log_subscribers", action: "show" },
        format: ":html",
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as HTML");
  });

  it("start processing as json", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        params: { controller: "another/log_subscribers", action: "show", format: "json" },
        format: ":json",
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as JSON");
  });

  it("start processing as non exten", () => {
    subscriber.startProcessing(
      makeEvent("start_processing.action_controller", {
        controller: "Another::LogSubscribersController",
        action: "show",
        params: { controller: "another/log_subscribers", action: "show", format: "noext" },
        format: undefined,
      }),
    );
    expect(logger.messages[0]).toBe("Processing by Another::LogSubscribersController#show as */*");
  });

  it("halted callback", () => {
    subscriber.haltedCallback(
      makeEvent("halted_callback.action_controller", { filter: ":redirector" }),
    );
    expect(logger.messages[0]).toBe("Filter chain halted as :redirector rendered or redirected");
  });

  it("process action", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 200 }, 42));
    expect(logger.messages[0]).toMatch(/Completed/);
    expect(logger.messages[0]).toMatch(/200 OK/);
  });

  it("process action without parameters", () => {
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

  it("with fragment cache", async () => {
    await controller.get("withFragmentCache");

    expect(logs.length).toBe(4);
    expect(logs[1]).toMatch(/Read fragment views\/foo/);
    expect(logs[2]).toMatch(/Write fragment views\/foo/);
  });

  it("with fragment cache when log disabled", async () => {
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = false;
    await controller.get("withFragmentCache");

    expect(logs.length).toBe(2);
    expect(logs[0]).toBe(
      "Processing by Another::LogSubscribersController#withFragmentCache as HTML",
    );
    expect(logs[1]).toMatch(/Completed 200 OK in \d+ms/);
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = true;
  });

  it("with fragment cache if with true", async () => {
    await controller.get("withFragmentCacheIfWithTrueCondition");

    expect(logs.length).toBe(4);
    expect(logs[1]).toMatch(/Read fragment views\/foo/);
    expect(logs[2]).toMatch(/Write fragment views\/foo/);
  });

  it("with fragment cache if with false", async () => {
    await controller.get("withFragmentCacheIfWithFalseCondition");

    expect(logs.length).toBe(2);
    expect(logs[1]).not.toMatch(/Read fragment views\/foo/);
    expect(logs[2] ?? "").not.toMatch(/Write fragment views\/foo/);
  });

  it("with fragment cache unless with true", async () => {
    await controller.get("withFragmentCacheUnlessWithTrueCondition");

    expect(logs.length).toBe(2);
    expect(logs[1]).not.toMatch(/Read fragment views\/foo/);
    expect(logs[2] ?? "").not.toMatch(/Write fragment views\/foo/);
  });

  it("with fragment cache unless with false", async () => {
    await controller.get("withFragmentCacheUnlessWithFalseCondition");

    expect(logs.length).toBe(4);
    expect(logs[1]).toMatch(/Read fragment views\/foo/);
    expect(logs[2]).toMatch(/Write fragment views\/foo/);
  });

  it("with fragment cache and percent in key", async () => {
    await controller.get("withFragmentCacheAndPercentInKey");

    expect(logs.length).toBe(4);
    expect(logs[1]).toMatch(/Read fragment views\/foo/);
    expect(logs[2]).toMatch(/Write fragment views\/foo/);
  });

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
