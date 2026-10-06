import { afterEach, beforeEach, describe, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import { ControllerRuntime, RuntimeRegistry } from "@blazetrails/activerecord";
import { Project } from "../test-helpers/fixtures/project.js";
import {
  assertEqual,
  assertMatch,
  LogSubscriber as ActiveSupportLogSubscriber,
} from "@blazetrails/activesupport";
import { TestHelper, type MockLogger } from "@blazetrails/activesupport/log-subscriber/test-helper";
import { ActionController } from "@blazetrails/actionpack";
import { include, type Included } from "@blazetrails/ruby-compat";

include(ActionController.Base, ControllerRuntime);

describe("ControllerRuntimeLogSubscriberTest", () => {
  class LogSubscriberController extends ActionController.Base {
    async show() {
      await this.render({ inline: "<%= TopLevel.Project.all().toString() %>" });
    }

    async zero() {
      await this.render({ inline: "Zero DB runtime" });
    }

    async create() {
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 100.0);
      await Project.last();
      this.redirectTo("/");
    }

    redirect() {
      Project.all();
      this.redirectTo({ action: "show" });
    }

    async dbAfterRender() {
      await this.render({ inline: "Hello world" });
      await Project.all().toArray();
      RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 100.0);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper` (`controller_runtime_test.rb:39`); the class/interface merge is how a mixin surfaces on the type side.
  interface ControllerRuntimeLogSubscriberTest extends Omit<
    Included<typeof TestHelper>,
    "setup" | "teardown" | "setLogger"
  > {}

  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
  class ControllerRuntimeLogSubscriberTest extends ActionController.TestCase {
    declare logger: MockLogger;
    declare oldLogger: typeof ActionController.Base.logger;

    static {
      include(this, TestHelper);
      this.tests(LogSubscriberController);

      this.withRoutes(function () {
        this.get("show", { to: `${LogSubscriberController.controllerPath()}#show` });
        this.get("zero", { to: `${LogSubscriberController.controllerPath()}#zero` });
        this.get("db_after_render", {
          to: `${LogSubscriberController.controllerPath()}#db_after_render`,
        });
        this.get("redirect", { to: `${LogSubscriberController.controllerPath()}#redirect` });
        this.post("create", { to: `${LogSubscriberController.controllerPath()}#create` });
      });
    }

    override setup(): void {
      this.oldLogger = ActionController.Base.logger;
      super.setup();
      ActionController.LogSubscriber.attachTo("action_controller");
    }

    override teardown(): void {
      super.teardown();
      ActiveSupportLogSubscriber.logSubscribers().length = 0;
      ActionController.Base.logger = this.oldLogger;
    }

    setLogger(logger: MockLogger | null): void {
      ActionController.Base.logger = logger as unknown as typeof ActionController.Base.logger;
    }
  }

  let tc: ControllerRuntimeLogSubscriberTest;

  beforeEach(async ({ task }) => {
    tc = new ControllerRuntimeLogSubscriberTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  afterEach(() => {
    tc.teardown();
  });

  it("log with active record", async () => {
    await tc.get("show");
    tc.wait();

    assertEqual(2, tc.logger.logged(":info").length);
    assertMatch(
      /\(Views: [\d.]+ms \| ActiveRecord: [\d.]+ms \(0 queries, 0 cached\) \| GC: [\d.]+ms\)/,
      tc.logger.logged(":info")[1],
    );
  });

  it("runtime reset before requests", async () => {
    RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 12345.0);
    await tc.get("zero");
    tc.wait();

    assertEqual(2, tc.logger.logged(":info").length);
    assertMatch(
      /\(Views: [\d.]+ms \| ActiveRecord: [\d.]+ms \(0 queries, 0 cached\) \| GC: [\d.]+ms\)/,
      tc.logger.logged(":info")[1],
    );
  });

  it("log with active record when post", async () => {
    await tc.post("create");
    tc.wait();
    assertMatch(
      /ActiveRecord: ([1-9][\d.]+)ms \(1 query, 0 cached\) \| GC: [\d.]+ms\)/,
      tc.logger.logged(":info")[2],
    );
  });

  it("log with active record when redirecting", async () => {
    await tc.get("redirect");
    tc.wait();
    assertEqual(3, tc.logger.logged(":info").length);
    assertMatch(
      /\(ActiveRecord: [\d.]+ms \(0 queries, 0 cached\) \| GC: [\d.]+ms\)/,
      tc.logger.logged(":info")[2],
    );
  });

  it("include time query time after rendering", async () => {
    await tc.get("db_after_render");
    tc.wait();

    assertEqual(2, tc.logger.logged(":info").length);
    assertMatch(
      /\(Views: [\d.]+ms \| ActiveRecord: ([1-9][\d.]+)ms \(1 query, 0 cached\) \| GC: [\d.]+ms\)/,
      tc.logger.logged(":info")[1],
    );
  });
});
