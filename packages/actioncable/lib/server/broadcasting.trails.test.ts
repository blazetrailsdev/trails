import { afterEach, describe, expect, it } from "vitest";
import { ActiveSupportJSON, Notifications } from "@blazetrails/activesupport";
import { Broadcasting } from "./broadcasting.js";

function server() {
  const s = {
    ...Broadcasting,
    sent: [] as unknown[][],
    debug: [] as string[],
    debugEnabled: true,
    reject: null as Error | null,
    logger: {
      debug(_progname: unknown, block: () => unknown) {
        if (s.debugEnabled) s.debug.push(String(block()));
      },
    },
    pubsub: {
      async broadcast(channel: string, payload: unknown) {
        await Promise.resolve();
        if (s.reject) throw s.reject;
        s.sent.push([channel, payload]);
      },
    },
  };
  return s;
}

describe("Server::Broadcasting", () => {
  afterEach(() => Notifications.unsubscribe("broadcast.action_cable"));

  it("converts a Symbol-named broadcasting to its name", () => {
    expect(server().broadcasterFor("test_queue").broadcasting).toBe("test_queue");
    expect(server().broadcasterFor("test_queue").coder).toBe(ActiveSupportJSON);
  });

  it("encodes with the coder and resolves after the adapter settles", async () => {
    const s = server();
    const events: unknown[] = [];
    Notifications.subscribe("broadcast.action_cable", (e) => events.push(e.payload));
    const promise = s.broadcast("q", { body: "hi" });
    expect(s.sent).toEqual([]);
    await promise;
    expect(s.sent).toEqual([["q", '{"body":"hi"}']]);
    expect(events).toEqual([
      { broadcasting: "q", message: { body: "hi" }, coder: ActiveSupportJSON },
    ]);
    expect(s.debug).toEqual(['[ActionCable] Broadcasting to q: {"body"=>"hi"}']);
  });

  it("sends the message raw with coder: null, even when forwarded as undefined", async () => {
    const s = server();
    await s.broadcast("q", { body: "hi" }, { coder: null });
    await s.broadcast("q", "raw", { coder: undefined });
    expect(s.sent).toEqual([
      ["q", { body: "hi" }],
      ["q", "raw"],
    ]);
  });

  it("does not inspect the message when debug is off", async () => {
    const s = server();
    s.debugEnabled = false;
    await s.broadcast("q", "x");
    expect(s.debug).toEqual([]);
  });

  it("rejects when the adapter rejects", async () => {
    const s = server();
    s.reject = new Error("down");
    await expect(s.broadcast("q", "x")).rejects.toThrow("down");
  });
});
