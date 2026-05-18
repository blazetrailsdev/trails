import { describe, it, expect, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { bodyFromString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ServerTiming } from "./server-timing.js";
import { SERVER_TIMING } from "../constants.js";

afterEach(() => {
  ServerTiming.unsubscribe();
});

describe("ServerTimingTest", () => {
  it("server timing header is included in the response", async () => {
    const inner = async (_env: RackEnv): Promise<RackResponse> => {
      await Notifications.instrumentAsync("custom.event", {}, async () => {});
      return [200, {}, bodyFromString("")];
    };
    const mw = new ServerTiming(inner);
    const [, headers] = await mw.call({});
    expect(headers[SERVER_TIMING]).toMatch(/custom\.event;dur=\d/);
  });

  it("includes custom active support events duration", async () => {
    const inner = async (_env: RackEnv): Promise<RackResponse> => {
      await Notifications.instrumentAsync("custom.event", {}, async () => {});
      return [200, {}, bodyFromString("")];
    };
    const mw = new ServerTiming(inner);
    const [, headers] = await mw.call({});
    expect(headers[SERVER_TIMING]).toMatch(/custom\.event;dur=\w+/);
  });

  it("events are tracked by async context", async () => {
    const inner = async (env: RackEnv): Promise<RackResponse> => {
      const proc = env["action_dispatch.test"] as () => Promise<void>;
      await proc();
      return [200, {}, bodyFromString("")];
    };
    const mw = new ServerTiming(inner);

    const r1 = mw.call({
      "action_dispatch.test": async () => {
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    const r2 = mw.call({
      "action_dispatch.test": async () => {
        await Notifications.instrumentAsync("custom.event", {}, async () => {});
      },
    });

    const [[, h1], [, h2]] = await Promise.all([r1, r2]);
    expect(h2[SERVER_TIMING]).toMatch(/custom\.event;dur=\w+/);
    expect(h1[SERVER_TIMING] ?? "").not.toMatch(/custom\.event;dur=\w+/);
  });

  it("does not overwrite existing header values", async () => {
    const inner = async (_env: RackEnv): Promise<RackResponse> => {
      await Notifications.instrumentAsync("custom.event", {}, async () => {});
      return [200, { [SERVER_TIMING]: 'entry;desc="description"' }, bodyFromString("")];
    };
    const mw = new ServerTiming(inner);
    const [, headers] = await mw.call({});
    expect(headers[SERVER_TIMING]).toMatch(/entry;desc="description"/);
    expect(headers[SERVER_TIMING]).toMatch(/custom\.event;dur=\w+/);
  });
});
