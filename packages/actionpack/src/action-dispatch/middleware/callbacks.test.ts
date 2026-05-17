import { describe, it, expect, beforeEach } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Callbacks } from "./callbacks.js";

const dummyApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  {},
  bodyFromString("response"),
];

const counts = { a: 0, b: 0 };

async function dispatch(block?: () => Promise<RackResponse>): Promise<RackResponse> {
  const app = block ?? dummyApp;
  return new Callbacks(app).call({});
}

describe("DispatcherTest", () => {
  beforeEach(() => {
    counts.a = 0;
    counts.b = 0;
    Callbacks.resetCallbacks("call");
  });

  it("before and after callbacks", async () => {
    Callbacks.before(() => {
      counts.a += 1;
      counts.b += 1;
    });
    Callbacks.after(() => {
      counts.a += 1;
      counts.b += 1;
    });

    await dispatch();
    expect(counts.a).toBe(2);
    expect(counts.b).toBe(2);

    await dispatch();
    expect(counts.a).toBe(4);
    expect(counts.b).toBe(4);

    try {
      await dispatch(async () => {
        throw new Error("error");
      });
    } catch {
      // expected
    }
    expect(counts.a).toBe(6);
    expect(counts.b).toBe(6);
  });
});
