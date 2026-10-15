/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveSupport::LogSubscriber::TestHelper`; the class/interface merge is how the mixin surfaces on the type side. */
import { afterEach, beforeEach, describe, it } from "vitest";
import { assertEqual, assertMatch } from "@blazetrails/activesupport";
import { TestHelper, type MockLogger } from "@blazetrails/activesupport/log-subscriber/test-helper";
import { include, type Included } from "@blazetrails/ruby-compat";
import { LogSubscriber } from "../../log-subscriber.js";
import type { DrawCallback } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import { RoutedRackApp } from "../../../test-helpers/abstract-unit.js";

interface RoutingLogSubscriberTest extends Omit<
  Included<typeof TestHelper>,
  "setup" | "teardown"
> {}

class RoutingLogSubscriberTest extends IntegrationTest {
  declare logger: MockLogger;
  private _logs?: string[];

  static {
    include(this, TestHelper);
  }

  override setup(): void {
    super.setup();
    LogSubscriber.attachTo("action_dispatch");
  }

  draw(block: DrawCallback): void {
    IntegrationTest.stubControllers((routes) => {
      routes.defaultUrlOptions = { host: "www.example.com" };
      routes.draw(block);
      this.app = new RoutedRackApp(routes);
    });
  }

  logs(): string[] {
    return (this._logs ??= this.logger.logged(":info"));
  }
}

describe("RoutingLogSubscriberTest", () => {
  let t: RoutingLogSubscriberTest;

  beforeEach(async ({ task }) => {
    t = new RoutingLogSubscriberTest(task.name);
    await t.beforeSetup();
    t.setup();
  });

  afterEach(() => {
    t.teardown();
  });

  it("redirect is logged", async () => {
    t.draw(function () {
      this.get("redirect", { to: this.redirect("/login") });
    });

    await t.get("/redirect");
    t.wait();

    assertEqual(2, t.logs().length);
    assertEqual("Redirected to http://www.example.com/login", t.logs()[0]);
    assertMatch(/Completed 301/, t.logs().at(-1)!);
  });
});
