import { beforeEach, describe, expect, it } from "vitest";
import { Notifications, type NotificationEvent as Event } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Request } from "../../http/request.js";
import type { DrawCallback } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import { RoutedRackApp } from "../../../test-helpers/abstract-unit.js";

describe("RoutingInstrumentationTest", () => {
  class RoutingInstrumentationTest extends IntegrationTest {}
  registerConstant("RoutingInstrumentationTest", RoutingInstrumentationTest);

  let t: RoutingInstrumentationTest;
  beforeEach(({ testCase }) => {
    t = testCase as RoutingInstrumentationTest;
  });

  it("redirect is instrumented", async () => {
    draw(function () {
      this.get("redirect", { to: this.redirect("/login") });
    });

    const event = await subscribed("redirect.action_dispatch", async () => {
      await t.get("/redirect");
    });

    expect(event!.payload.status).toBe(301);
    expect(event!.payload.location).toBe("http://www.example.com/login");
    expect(event!.payload.request).toBeInstanceOf(Request);
  });

  function draw(block: DrawCallback): void {
    IntegrationTest.stubControllers((routes) => {
      routes.defaultUrlOptions = { host: "www.example.com" };
      routes.draw(block);
      t.app = new RoutedRackApp(routes);
    });
  }

  async function subscribed(
    eventPattern: string,
    block: () => Promise<void>,
  ): Promise<Event | null> {
    let event: Event | null = null;
    const subscriber = (_event: Event): void => {
      event = _event;
    };
    await Notifications.subscribed(subscriber, eventPattern, block);
    return event;
  }
});
