import { beforeAll, describe, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  Assertion,
  assertEmpty,
  assertEqual,
  assertIncludes,
  assertNil,
  assertNotEmpty,
  assertRaises,
} from "@blazetrails/activesupport/testing/assertions";
import { include } from "@blazetrails/ruby-compat";
import "../test-helper.js";
import { TestHelper } from "../../lib/broadcastable/test-helper.js";
import { Message } from "../dummy/app/models/message.js";

type Helper = typeof TestHelper;
type Ctx = { testCase: { [K in keyof Helper]: OmitThisParameter<Helper[K]> } };
type Broadcasting = Record<string, (...args: unknown[]) => Promise<unknown>>;

class CaptureTurboStreamBroadcastsTest extends TestCase {}
include(CaptureTurboStreamBroadcastsTest, TestHelper);
class AssertTurboStreamBroadcastsTest extends TestCase {}
include(AssertTurboStreamBroadcastsTest, TestHelper);
class AssertNoTurboStreamBroadcastsTest extends TestCase {}
include(AssertNoTurboStreamBroadcastsTest, TestHelper);
Object.assign(TestHelper, {
  CaptureTurboStreamBroadcastsTest,
  AssertTurboStreamBroadcastsTest,
  AssertNoTurboStreamBroadcastsTest,
});

const newMessage = () => new Message({ id: 1 }) as Message & Broadcasting;

beforeAll(async () => {
  await Message.loadSchema();
});

describe("Turbo::Broadcastable::TestHelper::CaptureTurboStreamBroadcastsTest", () => {
  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on a stream name", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplaceTo("messages");
    await message.broadcastRemoveTo("messages");
    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts("messages");

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertNotEmpty(replace.at("template")!.elementChildren);
    assertNil(remove.at("template") ?? null);
  });

  it("#capture_turbo_stream_broadcasts returns an empty Array when no broadcasts happened on a stream name", async ({
    testCase: t,
  }: Ctx) => {
    assertEmpty(await t.captureTurboStreamBroadcasts("messages"));
  });

  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on a stream object", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplace();
    await message.broadcastRemove();
    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts(message);

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertNotEmpty(replace.at("template")!.elementChildren);
    assertNil(remove.at("template") ?? null);
  });

  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on an Array of stream objects", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplaceTo([message, "special"]);
    await message.broadcastRemoveTo([message, "special"]);
    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts([message, "special"]);

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertNotEmpty(replace.at("template")!.elementChildren);
    assertNil(remove.at("template") ?? null);
  });

  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts(
      "messages",
      async () => {
        await message.broadcastReplaceTo("messages");
        await message.broadcastRemoveTo("messages");
      },
    );

    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertEmpty(rest);
  });

  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on a stream object from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts(message, async () => {
      await message.broadcastReplace();
      await message.broadcastRemove();
    });

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertNotEmpty(replace.at("template")!.elementChildren);
    assertNil(remove.at("template") ?? null);
  });

  it("#capture_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on an Array of stream objects from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts(
      [message, "special"],
      async () => {
        await message.broadcastReplaceTo([message, "special"]);
        await message.broadcastRemoveTo([message, "special"]);
      },
    );

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
    assertNotEmpty(replace.at("template")!.elementChildren);
    assertNil(remove.at("template") ?? null);
  });

  it("#capture_turbo_stream_broadcasts returns an empty Array when no broadcasts happened on a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    const streams = await t.captureTurboStreamBroadcasts("messages", () => {});

    assertEmpty(streams);
  });
});

describe("Turbo::Broadcastable::TestHelper::AssertTurboStreamBroadcastsTest", () => {
  it("#assert_turbo_stream_broadcasts passes when there is a broadcast", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplaceTo("messages");

    await t.assertTurboStreamBroadcasts("messages");
  });

  it("#assert_turbo_stream_broadcasts passes when there are multiple broadcasts", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplaceTo("messages");
    await message.broadcastRemoveTo("messages");

    await t.assertTurboStreamBroadcasts("messages");
  });

  it("#assert_turbo_stream_broadcasts fails when no broadcasts happened on a stream name", async ({
    testCase: t,
  }: Ctx) => {
    await assertRaises([Assertion], {}, () => t.assertTurboStreamBroadcasts("messages"));
  });

  it("#assert_turbo_stream_broadcasts with a count: optional fails when no broadcasts happened on a stream name", async ({
    testCase: t,
  }: Ctx) => {
    const singularFailure = await assertRaises([Assertion], {}, () =>
      t.assertTurboStreamBroadcasts("messages", { count: 1 }),
    );

    assertIncludes(singularFailure.message, `1 Turbo Stream broadcast on "messages"`);

    const pluralFailure = await assertRaises([Assertion], {}, () =>
      t.assertTurboStreamBroadcasts("messages", { count: 2 }),
    );

    assertIncludes(pluralFailure.message, `2 Turbo Stream broadcasts on "messages"`);
  });

  it("#assert_turbo_stream_broadcasts passes when broadcast on a stream object", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplace();
    await message.broadcastRemove();

    await t.assertTurboStreamBroadcasts(message, { count: 2 });
  });

  it("#assert_turbo_stream_broadcasts passes when broadcast on an Array of stream objects", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastReplaceTo([message, "special"]);
    await message.broadcastRemoveTo([message, "special"]);

    await t.assertTurboStreamBroadcasts([message, "special"], { count: 2 });
  });

  it("#assert_turbo_stream_broadcasts with a count: option passes when broadcast on a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await t.assertTurboStreamBroadcasts("messages", { count: 2 }, async () => {
      await message.broadcastReplaceTo("messages");
      await message.broadcastRemoveTo("messages");
    });
  });

  it("#assert_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on a stream object from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await t.assertTurboStreamBroadcasts(message, { count: 2 }, async () => {
      await message.broadcastReplace();
      await message.broadcastRemove();
    });
  });

  it("#assert_turbo_stream_broadcasts returns <turbo-stream> elements broadcast on an Array of stream objects from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await t.assertTurboStreamBroadcasts([message, "special"], { count: 2 }, async () => {
      await message.broadcastReplaceTo([message, "special"]);
      await message.broadcastRemoveTo([message, "special"]);
    });
  });

  it("#assert_turbo_stream_broadcasts fails when no broadcasts happened on a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    await assertRaises([Assertion], {}, () =>
      t.assertTurboStreamBroadcasts("messages", {}, () => {}),
    );
  });

  it("#capture_turbo_stream_broadcasts only returns new <turbo-stream> elements when block given", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await message.broadcastUpdateTo("messages");
    await message.broadcastRefreshTo("messages");

    const [replace, remove, ...rest] = await t.captureTurboStreamBroadcasts(
      "messages",
      async () => {
        await message.broadcastReplaceTo("messages");
        await message.broadcastRemoveTo("messages");
      },
    );

    assertEmpty(rest);
    assertEqual("replace", replace.get("action"));
    assertEqual("remove", remove.get("action"));
  });
});

describe("Turbo::Broadcastable::TestHelper::AssertNoTurboStreamBroadcastsTest", () => {
  it("#assert_no_turbo_stream_broadcasts asserts no broadcasts with a stream name", async ({
    testCase: t,
  }: Ctx) => {
    await t.assertNoTurboStreamBroadcasts("messages");
  });

  it("#assert_no_turbo_stream_broadcasts asserts no broadcasts with a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    await t.assertNoTurboStreamBroadcasts("messages", () => {});
  });

  it("#assert_no_turbo_stream_broadcasts asserts no broadcasts with a stream object", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await t.assertNoTurboStreamBroadcasts(message);
  });

  it("#assert_no_turbo_stream_broadcasts asserts no broadcasts with a stream object from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await t.assertNoTurboStreamBroadcasts(message, () => {});
  });

  it("#assert_no_turbo_stream_broadcasts fails when when a broadcast happened on a stream name", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await assertRaises([Assertion], {}, async () => {
      await message.broadcastRemoveTo("messages");

      await t.assertNoTurboStreamBroadcasts("messages");
    });
  });

  it("#assert_no_turbo_stream_broadcasts fails when when a broadcast happened on a stream name from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await assertRaises([Assertion], {}, () =>
      t.assertNoTurboStreamBroadcasts("messages", () => message.broadcastRemoveTo("messages")),
    );
  });

  it("#assert_no_turbo_stream_broadcasts fails when when a broadcast happened on a stream object", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await assertRaises([Assertion], {}, async () => {
      await message.broadcastRemove();

      await t.assertNoTurboStreamBroadcasts(message);
    });
  });

  it("#assert_no_turbo_stream_broadcasts fails when when a broadcast happened on a stream object from a block", async ({
    testCase: t,
  }: Ctx) => {
    const message = newMessage();

    await assertRaises([Assertion], {}, () =>
      t.assertNoTurboStreamBroadcasts(message, () => message.broadcastRemove()),
    );
  });
});
