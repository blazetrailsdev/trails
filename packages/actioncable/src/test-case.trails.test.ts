import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import { ActionCable } from "./namespaces.js";
import { TestCase } from "./test-helpers/test-helper.js";
import { Test } from "./subscription-adapter/test.js";
import type { TestHelper } from "./test-helper.js";

describe("ActionCable::TestCase", () => {
  it("swaps a fresh Test adapter in before setup and restores the old one after teardown", async () => {
    const server = ActionCable.server() as { pubsub: unknown };
    const old = server.pubsub;
    const ran: string[] = [];
    class SwapTest extends TestCase {
      testSwap(): void {}
    }
    const klass = SwapTest as unknown as {
      setup(cb: () => void): void;
      teardown(cb: () => void): void;
    };
    klass.setup(() => {
      ran.push("setup");
    });
    klass.teardown(() => {
      ran.push("teardown");
    });
    const tc = new SwapTest("testSwap") as unknown as TestHelper;

    await tc.beforeSetup();
    expect(server.pubsub).toBeInstanceOf(Test);
    expect(server.pubsub).not.toBe(old);
    expect(ran).toEqual(["setup"]);

    await tc.afterTeardown();
    expect(ran).toEqual(["setup", "teardown"]);
    expect(server.pubsub).toBe(old);
  });

  it("runs the action_cable_test_case load hooks with the class", () => {
    let base: unknown;
    onLoad("action_cable_test_case", (klass: unknown) => {
      base = klass;
    });
    expect(base).toBe(TestCase);
    expect(ActionCable.TestCase).toBe(TestCase);
  });
});
