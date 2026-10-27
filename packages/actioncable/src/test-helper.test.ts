import { describe, it, type TestContext } from "vitest";
import {
  Assertion,
  assertEqual,
  assertMatch,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import { include, registerConstant } from "@blazetrails/ruby-compat";
import { ActionCable } from "./namespaces.js";
import { TestCase } from "./test-helpers/test-helper.js";
import { TestHelper } from "./test-helper.js";
import { Base as ChannelBase } from "./channel/base.js";

type HelperContext = TestContext & { testCase: TestHelper };

const server = (): { broadcast(stream: string, data: unknown): Promise<unknown> } =>
  ActionCable.server() as never;

class BroadcastChannel extends ChannelBase {}
registerConstant("BroadcastChannel", BroadcastChannel);

class TransmissionsTest extends TestCase {}
registerConstant("TransmissionsTest", TransmissionsTest);

class TransmittedDataTest extends TestCase {}
registerConstant("TransmittedDataTest", TransmittedDataTest);
include(TransmittedDataTest, TestHelper);

describe("TransmissionsTest", () => {
  it("assert broadcasts", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertBroadcasts("test", 1, () => server().broadcast("test", "message")),
    );
  });

  it("capture broadcasts", async ({ testCase: t }: HelperContext) => {
    let messages = await t.captureBroadcasts("test", () => server().broadcast("test", "message"));
    assertEqual("message", messages[0]);

    messages = await t.captureBroadcasts("test", async () => {
      await server().broadcast("test", { message: "one" });
      await server().broadcast("test", { message: "two" });
    });
    assertEqual(2, messages.length);
    assertEqual({ message: "one" }, messages[0]);
    assertEqual({ message: "two" }, messages.at(-1));
  });

  it("assert broadcasts with no block", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(async () => {
      await server().broadcast("test", "message");
      await t.assertBroadcasts("test", 1);
    });

    await assertNothingRaised(async () => {
      await server().broadcast("test", "message 2");
      await server().broadcast("test", "message 3");
      await t.assertBroadcasts("test", 3);
    });
  });

  it("assert no broadcasts with no block", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() => t.assertNoBroadcasts("test"));
  });

  it("assert no broadcasts", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoBroadcasts("test", () => server().broadcast("test2", "message")),
    );
  });

  it("assert broadcasts message too few sent", async ({ testCase: t }: HelperContext) => {
    await server().broadcast("test", "hello");
    const error = await assertRaises([Assertion], {}, () =>
      t.assertBroadcasts("test", 2, () => server().broadcast("test", "world")),
    );

    assertMatch(/2 .* but 1/, error.message);
  });

  it("assert broadcasts message too many sent", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertBroadcasts("test", 1, async () => {
        await server().broadcast("test", "hello");
        await server().broadcast("test", "world");
      }),
    );

    assertMatch(/1 .* but 2/, error.message);
  });

  it("assert no broadcasts failure", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoBroadcasts("test", () => server().broadcast("test", "hello")),
    );

    assertMatch(/0 .* but 1/, error.message);
  });
});

describe("TransmittedDataTest", () => {
  it("assert broadcast on", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertBroadcastOn("test", "message", () => server().broadcast("test", "message")),
    );
  });

  it("assert broadcast on with hash", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertBroadcastOn("test", { text: "hello" }, () =>
        server().broadcast("test", { text: "hello" }),
      ),
    );
  });

  it("assert broadcast on with no block", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(async () => {
      await server().broadcast("test", "hello");
      await t.assertBroadcastOn("test", "hello");
    });

    await assertNothingRaised(async () => {
      await server().broadcast("test", "world");
      await t.assertBroadcastOn("test", "world");
    });
  });

  it("assert broadcast on message", async ({ testCase: t }: HelperContext) => {
    await server().broadcast("test", "hello");
    const error = await assertRaises([Assertion], {}, () => t.assertBroadcastOn("test", "world"));

    assertMatch(/No messages sent/, error.message);
    assertMatch(/Message\(s\) found:\nhello/, error.message);
  });

  it("assert broadcast on message with empty channel", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () => t.assertBroadcastOn("test", "world"));

    assertMatch(/No messages sent/, error.message);
    assertMatch(/No message found for test/, error.message);
  });
});
