import { beforeEach, describe, expect, it } from "vitest";
import { Notifications, type NotificationEvent as Event } from "@blazetrails/activesupport";
import { Request } from "../../http/request.js";
import type { Mapper } from "../../routing/mapper.js";
import { IntegrationTest } from "../../testing/integration.js";
import { RoutedRackApp, stubControllers } from "../../../test-helpers/abstract-unit.js";

describe("RoutingInstrumentationTest", () => {
  let t: IntegrationTest;

  beforeEach(() => {
    t = new IntegrationTest();
  });

  it("redirect is instrumented", async () => {
    draw((r) => {
      r.get("redirect", { to: r.redirect("/login") });
    });

    const event = await subscribed("redirect.action_dispatch", () => t.get("/redirect"));

    expect(event!.payload.status).toBe(301);
    expect(event!.payload.location).toBe("http://www.example.com/login");
    expect(event!.payload.request).toBeInstanceOf(Request);
  });

  function draw(block: (r: Mapper) => void): void {
    stubControllers((routes) => {
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
