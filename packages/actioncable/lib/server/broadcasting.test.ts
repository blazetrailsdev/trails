import {
  ActiveSupportJSON,
  Notifications,
  type NotificationEvent,
} from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";
import "../test-helpers/test-helper.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";

describe("BroadcastingTest", () => {
  it("fetching a broadcaster converts the broadcasting queue to a string", () => {
    const broadcasting = "test_queue";
    const server = new TestServer();
    const broadcaster = server.broadcasterFor(broadcasting);

    expect(broadcaster.broadcasting).toBe("test_queue");
  });

  it("broadcast generates notification", async () => {
    try {
      const server = new TestServer();

      const events: NotificationEvent[] = [];
      Notifications.subscribe("broadcast.action_cable", (event) => events.push(event));

      const broadcasting = "test_queue";
      const message = { body: "test message" };
      await server.broadcast(broadcasting, message);

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("broadcast.action_cable");
      expect(events[0].payload.broadcasting).toBe(broadcasting);
      expect(events[0].payload.message).toEqual(message);
      expect(events[0].payload.coder).toBe(ActiveSupportJSON);
    } finally {
      Notifications.unsubscribe("broadcast.action_cable");
    }
  });

  it("broadcaster from broadcaster_for generates notification", async () => {
    try {
      const server = new TestServer();

      const events: NotificationEvent[] = [];
      Notifications.subscribe("broadcast.action_cable", (event) => events.push(event));

      const broadcasting = "test_queue";
      const message = { body: "test message" };

      const broadcaster = server.broadcasterFor(broadcasting);
      await broadcaster.broadcast(message);

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("broadcast.action_cable");
      expect(events[0].payload.broadcasting).toBe(broadcasting);
      expect(events[0].payload.message).toEqual(message);
      expect(events[0].payload.coder).toBe(ActiveSupportJSON);
    } finally {
      Notifications.unsubscribe("broadcast.action_cable");
    }
  });
});
