import { block, registerConstant } from "@blazetrails/ruby-compat";
import { describe, it, beforeEach, afterEach } from "vitest";
import {
  assertEqual,
  assertMatch,
  assertNil,
  assertNoMatch,
  LogSubscriber as ActiveSupportLogSubscriber,
} from "@blazetrails/activesupport";
import { TestHelper, type MockLogger } from "@blazetrails/activesupport/log-subscriber/test-helper";
import {
  Dir,
  Exception,
  File,
  FileUtils,
  include,
  inspect,
  kernelCatch,
  kernelThrow,
  type Included,
} from "@blazetrails/ruby-compat";
import type { Headers } from "../../action-dispatch/http/headers.js";
import { LogSubscriber } from "../log-subscriber.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import type { CachingClassMethods } from "../../abstract-controller/caching.js";

import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";
import { ActionNotFound } from "../../abstract-controller/base.js";

registerConstant("Another", { name: "Another" });

class SpecialException extends Exception {}

class LogSubscribersController extends Base {
  static {
    this.wrapParameters("person", { include: "name", format: ":json" });

    this.rescueFrom(
      SpecialException,
      block(function (this: LogSubscribersController) {
        this.head(406);
      }),
    );

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

  async dataSender() {
    await this.sendData("cool data", { filename: "file.txt" });
  }

  fileSender() {
    this.sendFile(File.expandPath("company.rb", FIXTURE_LOAD_PATH));
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

  withThrow() {
    kernelThrow(":halt");
  }

  withException() {
    throw new Exception();
  }

  withRescuedException() {
    throw new SpecialException();
  }

  withActionNotFound() {
    throw new ActionNotFound();
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper` (`log_subscriber_test.rb:105`); the class/interface merge is how a mixin surfaces on the type side.
interface ACLogSubscriberTest extends Omit<
  Included<typeof TestHelper>,
  "setup" | "teardown" | "setLogger"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class ACLogSubscriberTest extends TestCase {
  declare logger: MockLogger;
  declare oldLogger: typeof Base.logger;
  declare cachePath: string;
  declare controller: LogSubscribersController;
  private _logs?: string[];

  static {
    this.tests(LogSubscribersController);
    include(this, TestHelper);
  }

  override setup(): void {
    super.setup();
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = true;

    this.oldLogger = Base.logger;

    this.cachePath = Dir.mktmpdir(["tmp", "cache"]);
    const controllerClass = LogSubscribersController as unknown as CachingClassMethods;
    controllerClass.cacheStore = [":file_store", this.cachePath];
    controllerClass.performCaching = true;
    LogSubscriber.attachTo("action_controller");
  }

  override teardown(): void {
    super.teardown();
    ActiveSupportLogSubscriber.logSubscribers().length = 0;
    FileUtils.rmRf(this.cachePath);
    Base.logger = this.oldLogger;
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = true;
  }

  setLogger(logger: MockLogger | null): void {
    Base.logger = logger as unknown as typeof Base.logger;
  }

  logs(): string[] {
    return (this._logs ??= this.logger.logged(":info"));
  }
}

describe("ACLogSubscriberTest", () => {
  let tc: ACLogSubscriberTest;

  beforeEach(async ({ task }) => {
    tc = new ACLogSubscriberTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    tc.teardown();
  });

  it("start processing", async () => {
    await tc.get("show");
    tc.wait();
    assertEqual(2, tc.logs().length);
    assertEqual("Processing by Another::LogSubscribersController#show as HTML", tc.logs()[0]);
  });

  it("start processing as json", async () => {
    await tc.get("show", { format: "json" });
    tc.wait();
    assertEqual(2, tc.logs().length);
    assertEqual("Processing by Another::LogSubscribersController#show as JSON", tc.logs()[0]);
  });

  it("start processing as non exten", async () => {
    await tc.get("show", { format: "noext" });
    tc.wait();
    assertEqual(2, tc.logs().length);
    assertEqual("Processing by Another::LogSubscribersController#show as */*", tc.logs()[0]);
  });

  it("halted callback", async () => {
    await tc.get("neverExecuted");
    tc.wait();
    assertEqual(4, tc.logs().length);
    assertEqual("Filter chain halted as :redirector rendered or redirected", tc.logs()[2]);
  });

  it("process action", async () => {
    await tc.get("show");
    tc.wait();
    assertEqual(2, tc.logs().length);
    assertMatch(/Completed/, tc.logs().at(-1)!);
    assertMatch(/200 OK/, tc.logs().at(-1)!);
  });

  it("process action without parameters", async () => {
    await tc.get("show");
    tc.wait();
    assertNil(tc.logs().find((l) => /Parameters/.test(l)) ?? null);
  });

  it("process action with parameters", async () => {
    await tc.get("show", { params: { id: "10" } });
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual(`Parameters: ${inspect({ id: "10" })}`, tc.logs()[1]);
  });

  it("multiple process with parameters", async () => {
    await tc.get("show", { params: { id: "10" } });
    await tc.get("show", { params: { id: "20" } });

    tc.wait();

    assertEqual(6, tc.logs().length);
    assertEqual(`Parameters: ${inspect({ id: "10" })}`, tc.logs()[1]);
    assertEqual(`Parameters: ${inspect({ id: "20" })}`, tc.logs()[4]);
  });

  it("process action with wrapped parameters", async () => {
    tc.request.env["CONTENT_TYPE"] = "application/json";
    await tc.post("show", { params: { id: "10", name: "jose" } });
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertMatch(inspect({ person: { name: "jose" } }).slice(1, -1), tc.logs()[1]);
  });

  it("process action with view runtime", async () => {
    await tc.get("show");
    tc.wait();
    assertMatch(/Completed 200 OK in \d+ms/, tc.logs()[1]);
  });

  it("process action with path", async () => {
    tc.request.env["action_dispatch.parameter_filter"] = ["password"];
    await tc.get("show", { params: { password: "test" } });
    tc.wait();
    assertMatch(/\/show\?password=\[FILTERED\]/, tc.controller.lastPayload.path as string);
  });

  it("process action with throw", async () => {
    await kernelCatch(":halt", async () => {
      await tc.get("withThrow");
      tc.wait();
    });
    assertMatch(/Completed {3}in \d+ms/, tc.logs()[1]);
  });

  it("append info to payload is called even with exception", async () => {
    try {
      await tc.get("withException");
      tc.wait();
    } catch (e) {
      if (!(e instanceof Exception)) throw e;
    }

    assertEqual("test_value", tc.controller.lastPayload.test_key);
  });

  it("process action headers", async () => {
    await tc.get("show");
    tc.wait();
    assertEqual("Rails Testing", (tc.controller.lastPayload.headers as Headers).get("User-Agent"));
  });

  it("process action with filter parameters", async () => {
    tc.request.env["action_dispatch.parameter_filter"] = ["lifo", "amount"];

    await tc.get("show", {
      params: { lifo: "Pratik", amount: "420", step: "1" },
    });
    tc.wait();

    const params = tc.logs()[1];
    assertMatch(inspect({ amount: "[FILTERED]" }).slice(1, -1), params);
    assertMatch(inspect({ lifo: "[FILTERED]" }).slice(1, -1), params);
    assertMatch(inspect({ step: "1" }).slice(1, -1), params);
  });

  it("redirect to", async () => {
    await tc.get("redirector");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual("Redirected to http://foo.bar/", tc.logs()[1]);
    assertMatch(/Completed 302/, tc.logs().at(-1)!);
  });

  it("filter redirect url by string", async () => {
    tc.request.env["action_dispatch.redirect_filter"] = ["secret"];
    await tc.get("filterableRedirector");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual("Redirected to [FILTERED]", tc.logs()[1]);
  });

  it("filter redirect url by regexp", async () => {
    tc.request.env["action_dispatch.redirect_filter"] = [/secret\.foo.+/];
    await tc.get("filterableRedirector");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual("Redirected to [FILTERED]", tc.logs()[1]);
  });

  it("does not filter redirect params by default", async () => {
    await tc.get("filterableRedirectorWithParams");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual("Redirected to http://secret.foo.bar?username=repinel&password=1234", tc.logs()[1]);
  });

  it("filter redirect params by string", async () => {
    tc.request.env["action_dispatch.parameter_filter"] = ["password"];
    await tc.get("filterableRedirectorWithParams");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual(
      "Redirected to http://secret.foo.bar?username=repinel&password=[FILTERED]",
      tc.logs()[1],
    );
  });

  it("filter redirect params by regexp", async () => {
    tc.request.env["action_dispatch.parameter_filter"] = [/pass.+/];
    await tc.get("filterableRedirectorWithParams");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual(
      "Redirected to http://secret.foo.bar?username=repinel&password=[FILTERED]",
      tc.logs()[1],
    );
  });

  it("filter redirect bad uri", async () => {
    tc.request.env["action_dispatch.parameter_filter"] = [/pass.+/];

    await tc.get("filterableRedirectorBadUri");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertEqual("Redirected to [FILTERED]", tc.logs()[1]);
  });

  it("send data", async () => {
    await tc.get("dataSender");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertMatch(/Sent data file\.txt/, tc.logs()[1]);
  });

  it("send file", async () => {
    await tc.get("fileSender");
    tc.wait();

    assertEqual(3, tc.logs().length);
    assertMatch(/Sent file/, tc.logs()[1]);
    assertMatch(/test-helpers\/fixtures\/company\.rb/, tc.logs()[1]);
  });

  it("with fragment cache", async () => {
    await tc.get("withFragmentCache");
    tc.wait();

    assertEqual(4, tc.logs().length);
    assertMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("with fragment cache when log disabled", async () => {
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = false;
    await tc.get("withFragmentCache");
    tc.wait();

    assertEqual(2, tc.logs().length);
    assertEqual(
      "Processing by Another::LogSubscribersController#withFragmentCache as HTML",
      tc.logs()[0],
    );
    assertMatch(/Completed 200 OK in \d+ms/, tc.logs()[1]);
    (Base as unknown as CachingClassMethods).enableFragmentCacheLogging = true;
  });

  it("with fragment cache if with true", async () => {
    await tc.get("withFragmentCacheIfWithTrueCondition");
    tc.wait();

    assertEqual(4, tc.logs().length);
    assertMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("with fragment cache if with false", async () => {
    await tc.get("withFragmentCacheIfWithFalseCondition");
    tc.wait();

    assertEqual(2, tc.logs().length);
    assertNoMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertNoMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("with fragment cache unless with true", async () => {
    await tc.get("withFragmentCacheUnlessWithTrueCondition");
    tc.wait();

    assertEqual(2, tc.logs().length);
    assertNoMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertNoMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("with fragment cache unless with false", async () => {
    await tc.get("withFragmentCacheUnlessWithFalseCondition");
    tc.wait();

    assertEqual(4, tc.logs().length);
    assertMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("with fragment cache and percent in key", async () => {
    await tc.get("withFragmentCacheAndPercentInKey");
    tc.wait();

    assertEqual(4, tc.logs().length);
    assertMatch(/Read fragment views\/foo/, tc.logs()[1]);
    assertMatch(/Write fragment views\/foo/, tc.logs()[2]);
  });

  it("process action with exception includes http status code", async () => {
    try {
      await tc.get("withException");
      tc.wait();
    } catch (e) {
      if (!(e instanceof Exception)) throw e;
    }
    assertEqual(2, tc.logs().length);
    assertMatch(/Completed 500/, tc.logs().at(-1)!);
  });

  it("process action with rescued exception includes http status code", async () => {
    await tc.get("withRescuedException");
    tc.wait();

    assertEqual(2, tc.logs().length);
    assertMatch(/Completed 406/, tc.logs().at(-1)!);
  });

  it("process action with with action not found logs 404", async () => {
    try {
      await tc.get("withActionNotFound");
      tc.wait();
    } catch (e) {
      if (!(e instanceof ActionNotFound)) throw e;
    }

    assertEqual(2, tc.logs().length);
    assertMatch(/Completed 404/, tc.logs().at(-1)!);
  });
});
