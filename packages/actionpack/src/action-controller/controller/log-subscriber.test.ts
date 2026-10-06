import { registerConstant } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assertEqual,
  assertMatch,
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent,
  Notifications,
} from "@blazetrails/activesupport";
import {
  Dir,
  Exception,
  FileUtils,
  inspect,
  kernelCatch,
  kernelThrow,
} from "@blazetrails/ruby-compat";
import type { Headers } from "../../action-dispatch/http/headers.js";
import { LogSubscriber } from "../log-subscriber.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import type { CachingClassMethods } from "../../abstract-controller/caching.js";

registerConstant("Another", { name: "Another" });
import "../../test-helpers/abstract-unit.js";

class SpecialException extends Error {}

class LogSubscribersController extends Base {
  static {
    this.wrapParameters("person", { include: "name", format: ":json" });

    this.rescueFrom(SpecialException, function (this: LogSubscribersController) {
      this.head(406);
    });

    this.beforeAction("redirector", { only: "neverExecuted" });
  }

  lastPayload!: Record<string, unknown>;

  neverExecuted() {}

  show() {
    this.head("ok");
  }

  redirector() {
    this.redirectTo("http://foo.bar/");
  }

  filterableRedirector() {
    this.redirectTo("http://secret.foo.bar/");
  }

  filterableRedirectorWithParams() {
    this.redirectTo("http://secret.foo.bar?username=repinel&password=1234");
  }

  filterableRedirectorBadUri() {
    this.redirectTo(" s:/invalid-string0uri");
  }

  withThrow() {
    kernelThrow(":halt");
  }

  withException() {
    throw new Exception();
  }

  async withFragmentCache() {
    await this.render({ inline: '<%= context.cache("foo", {}, () => { %>bar<% }) %>' });
  }

  async withFragmentCacheAndPercentInKey() {
    await this.render({
      inline: '<%= context.cache("foo%bar", {}, () => { %>Contains % sign in key<% }) %>',
    });
  }

  async withFragmentCacheIfWithTrueCondition() {
    await this.render({ inline: '<%= context.cacheIf(true, "foo", {}, () => { %>bar<% }) %>' });
  }

  async withFragmentCacheIfWithFalseCondition() {
    await this.render({ inline: '<%= context.cacheIf(false, "foo", {}, () => { %>bar<% }) %>' });
  }

  async withFragmentCacheUnlessWithFalseCondition() {
    await this.render({
      inline: '<%= context.cacheUnless(false, "foo", {}, () => { %>bar<% }) %>',
    });
  }

  async withFragmentCacheUnlessWithTrueCondition() {
    await this.render({ inline: '<%= context.cacheUnless(true, "foo", {}, () => { %>bar<% }) %>' });
  }
}

const appendInfoToPayload = Base.prototype.appendInfoToPayload;
LogSubscribersController.prototype.appendInfoToPayload = function (payload) {
  appendInfoToPayload.call(this, payload);
  payload.test_key = "test_value";
  (this as LogSubscribersController).lastPayload = payload;
};

Object.defineProperty(LogSubscribersController, "name", {
  value: "Another::LogSubscribersController",
});

class CaptureLogger {
  messages: string[] = [];
  get "info?"(): boolean {
    return true;
  }
  info(msg: string | (() => string)): void {
    this.messages.push((typeof msg === "function" ? msg() : msg).trim());
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
  let cachePath: string;
  const lastPayload = () => (controller.controller as LogSubscribersController).lastPayload;

  beforeEach(async ({ task }) => {
    subscriber = new LogSubscriber();
    logger = new CaptureLogger();
    logs = logger.messages;
    vi.spyOn(BaseLogSubscriber, "logger", "get").mockReturnValue(logger as never);

    const caching = Base as unknown as CachingClassMethods;
    oldEnableFragmentCacheLogging = caching.enableFragmentCacheLogging!;
    caching.enableFragmentCacheLogging = true;

    controller = new TestCase(task.name);
    controller.controller = new LogSubscribersController();

    await controller.beforeSetup();
    const controllerClass = LogSubscribersController as unknown as CachingClassMethods;
    cachePath = Dir.mktmpdir(["tmp", "cache"]);
    controllerClass.cacheStore = [":file_store", cachePath];
    controllerClass.performCaching = true;
    Notifications.unsubscribeAll();
    LogSubscriber.attachTo("action_controller");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
    FileUtils.rmRf(cachePath);
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

  it("process action with parameters", async () => {
    await controller.get("show", { params: { id: "10" } });

    assertEqual(3, logs.length);
    assertEqual(`Parameters: ${inspect({ id: "10" })}`, logs[1]);
  });

  it("multiple process with parameters", async () => {
    await controller.get("show", { params: { id: "10" } });
    await controller.get("show", { params: { id: "20" } });

    assertEqual(6, logs.length);
    assertEqual(`Parameters: ${inspect({ id: "10" })}`, logs[1]);
    assertEqual(`Parameters: ${inspect({ id: "20" })}`, logs[4]);
  });

  it("process action with wrapped parameters", async () => {
    controller.request.env["CONTENT_TYPE"] = "application/json";
    await controller.post("show", { params: { id: "10", name: "jose" } });

    assertEqual(3, logs.length);
    assertMatch(inspect({ person: { name: "jose" } }).slice(1, -1), logs[1]);
  });

  it("process action with view runtime", () => {
    subscriber.processAction(makeEvent("process_action.action_controller", { status: 200 }, 37));
    expect(logger.messages[0]).toMatch(/Completed 200 OK in \d+ms/);
  });

  it("process action with path", async () => {
    controller.request.env["action_dispatch.parameter_filter"] = ["password"];
    await controller.get("show", { params: { password: "test" } });
    assertMatch(/\/show\?password=\[FILTERED\]/, lastPayload().path as string);
  });

  it("process action with throw", async () => {
    await kernelCatch(":halt", async () => {
      await controller.get("withThrow");
    });
    assertMatch(/Completed {3}in \d+ms/, logs[1]);
  });

  it("append info to payload is called even with exception", async () => {
    try {
      await controller.get("withException");
    } catch (e) {
      if (!(e instanceof Exception)) throw e;
    }

    assertEqual("test_value", lastPayload().test_key);
  });

  it("process action headers", async () => {
    await controller.get("show");
    assertEqual("Rails Testing", (lastPayload().headers as Headers).get("User-Agent"));
  });

  it("process action with filter parameters", async () => {
    controller.request.env["action_dispatch.parameter_filter"] = ["lifo", "amount"];

    await controller.get("show", {
      params: { lifo: "Pratik", amount: "420", step: "1" },
    });

    const params = logs[1];
    assertMatch(inspect({ amount: "[FILTERED]" }).slice(1, -1), params);
    assertMatch(inspect({ lifo: "[FILTERED]" }).slice(1, -1), params);
    assertMatch(inspect({ step: "1" }).slice(1, -1), params);
  });

  it("redirect to", () => {
    subscriber.redirectTo(
      makeEvent("redirect_to.action_controller", { location: "http://foo.bar/" }),
    );
    expect(logger.messages[0]).toBe("Redirected to http://foo.bar/");
  });

  it("filter redirect url by string", async () => {
    controller.request.env["action_dispatch.redirect_filter"] = ["secret"];
    await controller.get("filterableRedirector");

    assertEqual(3, logs.length);
    assertEqual("Redirected to [FILTERED]", logs[1]);
  });

  it("filter redirect url by regexp", async () => {
    controller.request.env["action_dispatch.redirect_filter"] = [/secret\.foo.+/];
    await controller.get("filterableRedirector");

    assertEqual(3, logs.length);
    assertEqual("Redirected to [FILTERED]", logs[1]);
  });

  it("does not filter redirect params by default", async () => {
    await controller.get("filterableRedirectorWithParams");

    assertEqual(3, logs.length);
    assertEqual("Redirected to http://secret.foo.bar?username=repinel&password=1234", logs[1]);
  });

  it("filter redirect params by string", async () => {
    controller.request.env["action_dispatch.parameter_filter"] = ["password"];
    await controller.get("filterableRedirectorWithParams");

    assertEqual(3, logs.length);
    assertEqual(
      "Redirected to http://secret.foo.bar?username=repinel&password=[FILTERED]",
      logs[1],
    );
  });

  it("filter redirect params by regexp", async () => {
    controller.request.env["action_dispatch.parameter_filter"] = [/pass.+/];
    await controller.get("filterableRedirectorWithParams");

    assertEqual(3, logs.length);
    assertEqual(
      "Redirected to http://secret.foo.bar?username=repinel&password=[FILTERED]",
      logs[1],
    );
  });

  it("filter redirect bad uri", async () => {
    controller.request.env["action_dispatch.parameter_filter"] = [/pass.+/];

    await controller.get("filterableRedirectorBadUri");

    assertEqual(3, logs.length);
    assertEqual("Redirected to [FILTERED]", logs[1]);
  });

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
