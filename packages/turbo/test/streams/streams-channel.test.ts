import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Extended, Included } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/actioncable/channel/test-case.js";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { Thread, constSet, include } from "@blazetrails/ruby-compat";
import { withProductionDebouncer } from "../test-helper.js";
import type { Broadcasts } from "../../lib/app/channels/turbo/streams/broadcasts.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { ActionHelper } from "../../lib/app/helpers/turbo/streams/action-helper.js";
import { Turbo } from "../../lib/turbo-trails.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import { Message } from "../dummy/app/models/message.js";

class StreamsChannelTest extends TestCase {}
include(StreamsChannelTest, ActiveJobTestHelper);
include(StreamsChannelTest, ActionHelper);
constSet(Turbo, "StreamsChannelTest", StreamsChannelTest);

type Ctx = {
  testCase: StreamsChannelTest & ActiveJobTestHelper & Included<typeof ActionHelper>;
};

const render = (options: object): Promise<unknown> => ApplicationController.render(options);

const channel = StreamsChannel as typeof StreamsChannel & Extended<typeof Broadcasts>;

describe("Turbo::StreamsChannelTest", () => {
  beforeAll(async () => {
    await Message.loadSchema();
  });

  beforeEach(() => {
    Turbo.currentRequestId = null;
    for (const key of Thread.current().keys()) {
      if (key.startsWith("turbo-")) Thread.current().set(key, null);
    }
  });

  it("verified stream name", () => {
    expect(channel.verifiedStreamName(channel.signedStreamName("stream"))).toBe("stream");
  });

  it("broadcasting remove now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("remove", { target: "message_1" }),
      () => channel.broadcastRemoveTo("stream", { target: "message_1" }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("remove", { targets: ".message" }),
      () => channel.broadcastRemoveTo("stream", { targets: ".message" }),
    );
  });

  it("broadcasting remove now with record", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("remove", { target: "message_1" }),
      () =>
        channel.broadcastRemoveTo("stream", {
          target: new Message({ id: 1, content: "hello!" }),
        }),
    );
  });

  it("broadcasting replace now", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { target: "message_1", template: await render(options) }),
      () => channel.broadcastReplaceTo("stream", { target: "message_1", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { targets: ".message", template: await render(options) }),
      () => channel.broadcastReplaceTo("stream", { targets: ".message", ...options }),
    );
  });

  it("broadcasting update now", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", { target: "message_1", template: await render(options) }),
      () => channel.broadcastUpdateTo("stream", { target: "message_1", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", { targets: ".message", template: await render(options) }),
      () => channel.broadcastUpdateTo("stream", { targets: ".message", ...options }),
    );
  });

  it("broadcasting append now", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", { target: "messages", template: await render(options) }),
      () => channel.broadcastAppendTo("stream", { target: "messages", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", { targets: ".message", template: await render(options) }),
      () => channel.broadcastAppendTo("stream", { targets: ".message", ...options }),
    );
  });

  it("broadcasting prepend now", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(options) }),
      () => channel.broadcastPrependTo("stream", { target: "messages", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: await render(options) }),
      () => channel.broadcastPrependTo("stream", { targets: ".message", ...options }),
    );
  });

  it("broadcasting replace later", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { target: "message_1", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastReplaceLaterTo("stream", { target: "message_1", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { targets: ".message", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastReplaceLaterTo("stream", { targets: ".message", ...options }),
        ),
    );
  });

  it("broadcasting update later", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", { target: "message_1", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastUpdateLaterTo("stream", { target: "message_1", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", { targets: ".message", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastUpdateLaterTo("stream", { targets: ".message", ...options }),
        ),
    );
  });

  it("broadcasting append later", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", { target: "messages", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastAppendLaterTo("stream", { target: "messages", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", { targets: ".message", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastAppendLaterTo("stream", { targets: ".message", ...options }),
        ),
    );
  });

  it("broadcasting prepend later", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastPrependLaterTo("stream", { target: "messages", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastPrependLaterTo("stream", { targets: ".message", ...options }),
        ),
    );
  });

  it("broadcasting append now with empty template", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      `<turbo-stream action="append" target="message_1"><template></template></turbo-stream>`,
      () => channel.broadcastAppendTo("stream", { target: "message_1", content: "" }),
    );
  });

  it("broadcasting refresh now", async ({ testCase: t }: Ctx) => {
    await Turbo.withRequestId("123", async () => {
      await t.assertBroadcastOn("stream", t.turboStreamRefreshTag({ requestId: null }), () =>
        channel.broadcastRefreshTo("stream", { requestId: null }),
      );

      await t.assertBroadcastOn("stream", t.turboStreamRefreshTag({ requestId: "123" }), () =>
        channel.broadcastRefreshTo("stream"),
      );

      await t.assertBroadcastOn(
        "stream",
        t.turboStreamRefreshTag({ requestId: "456", refresh: "morph" }),
        () => channel.broadcastRefreshTo("stream", { requestId: "456", refresh: "morph" }),
      );
    });
  });

  it("broadcasting action now", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(options) }),
      () =>
        channel.broadcastActionTo("stream", { action: "prepend", target: "messages", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: await render(options) }),
      () =>
        channel.broadcastActionTo("stream", {
          action: "prepend",
          targets: ".message",
          ...options,
        }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: "<span>test</span>" }),
      () =>
        channel.broadcastActionTo("stream", {
          action: "prepend",
          targets: ".message",
          content: "<span>test</span>",
        }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: "<span>test</span>" }),
      () =>
        channel.broadcastActionTo("stream", {
          action: "prepend",
          targets: ".message",
          html: "<span>test</span>",
        }),
    );
  });

  it("broadcasting refresh later", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn("stream", t.turboStreamRefreshTag(), () =>
      t.performEnqueuedJobs({}, async () => {
        await channel.broadcastRefreshLaterTo("stream");
        await channel.refreshDebouncerFor("stream").wait();
      }),
    );

    Turbo.currentRequestId = "123";
    await t.assertBroadcastOn("stream", t.turboStreamRefreshTag({ requestId: "123" }), () =>
      t.performEnqueuedJobs({}, async () => {
        await channel.broadcastRefreshLaterTo("stream");
        await channel.refreshDebouncerFor("stream", { requestId: "123" }).wait();
      }),
    );
  });

  it("broadcasting refresh later is debounced", async ({ testCase: t }: Ctx) => {
    await withProductionDebouncer(() =>
      t.assertBroadcastOn("stream", t.turboStreamRefreshTag(), () =>
        t.assertBroadcasts("stream", 1, () =>
          t.performEnqueuedJobs({}, async () => {
            await channel.broadcastRefreshLaterTo("stream");

            await channel.refreshDebouncerFor("stream").wait();
          }),
        ),
      ),
    );
  });

  it("broadcasting refresh later is debounced considering the current request id", async ({
    testCase: t,
  }: Ctx) => {
    await withProductionDebouncer(() =>
      t.assertBroadcasts("stream", 2, () =>
        t.performEnqueuedJobs({}, () =>
          t.assertBroadcastOn("stream", t.turboStreamRefreshTag({ "request-id": "123" }), () =>
            t.assertBroadcastOn(
              "stream",
              t.turboStreamRefreshTag({ "request-id": "456" }),
              async () => {
                Turbo.currentRequestId = "123";
                for (let i = 0; i < 3; i++) await channel.broadcastRefreshLaterTo("stream");

                Turbo.currentRequestId = "456";
                for (let i = 0; i < 3; i++) await channel.broadcastRefreshLaterTo("stream");

                const debouncer123 = channel.refreshDebouncerFor("stream", { requestId: "123" });
                const debouncer456 = channel.refreshDebouncerFor("stream", { requestId: "456" });
                await debouncer123.wait();
                await debouncer456.wait();
              },
            ),
          ),
        ),
      ),
    );
  });

  it("broadcasting action later", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastActionLaterTo("stream", {
            action: "prepend",
            target: "messages",
            ...options,
          }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { targets: ".message", template: await render(options) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastActionLaterTo("stream", {
            action: "prepend",
            targets: ".message",
            ...options,
          }),
        ),
    );
  });

  it("broadcasting action later with ActiveModel array target", async ({ testCase: t }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    const message = new Message({ id: 42 });
    const target = [message, "opt"];
    const expectedTarget = "opt_message_42";

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", {
        target: expectedTarget,
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastActionLaterTo("stream", { action: "prepend", target, ...options }),
        ),
    );
  });

  it("broadcasting action later with multiple ActiveModel targets", async ({
    testCase: t,
  }: Ctx) => {
    const options = { partial: "messages/message", locals: { message: "hello!" } };

    const one = new Message({ id: 1 });
    const targets = [one, "messages"];
    const expectedTargets = "#messages_message_1";

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", {
        targets: expectedTargets,
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastActionLaterTo("stream", { action: "prepend", targets, ...options }),
        ),
    );
  });

  it("broadcasting render now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { target: "message_1", template: "Goodbye!" }),
      () => channel.broadcastRenderTo("stream", { partial: "messages/message" }),
    );
  });

  it("broadcasting render later", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { target: "message_1", template: "Goodbye!" }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastRenderLaterTo("stream", { partial: "messages/message" }),
        ),
    );
  });

  it("broadcasting direct update now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn("stream", `direct`, () =>
      channel.broadcastStreamTo("stream", { content: "direct" }),
    );
  });

  it("broadcasting actions with method morph now", async ({ testCase: t }: Ctx) => {
    const options = {
      attributes: { method: "morph" },
      partial: "messages/message",
      locals: { message: "hello!" },
    };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", {
        target: "message_1",
        method: "morph",
        template: await render(options),
      }),
      () => channel.broadcastReplaceTo("stream", { target: "message_1", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", {
        targets: ".message",
        method: "morph",
        template: await render(options),
      }),
      () => channel.broadcastReplaceTo("stream", { targets: ".message", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        target: "message_1",
        method: "morph",
        template: await render(options),
      }),
      () => channel.broadcastUpdateTo("stream", { target: "message_1", ...options }),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        targets: ".message",
        method: "morph",
        template: await render(options),
      }),
      () => channel.broadcastUpdateTo("stream", { targets: ".message", ...options }),
    );
  });

  it("broadcasting actions with method morph later", async ({ testCase: t }: Ctx) => {
    const options = {
      attributes: { method: "morph" },
      partial: "messages/message",
      locals: { message: "hello!" },
    };

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", {
        target: "message_1",
        method: "morph",
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastReplaceLaterTo("stream", { target: "message_1", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", {
        targets: ".message",
        method: "morph",
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastReplaceLaterTo("stream", { targets: ".message", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        target: "message_1",
        method: "morph",
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastUpdateLaterTo("stream", { target: "message_1", ...options }),
        ),
    );

    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        targets: ".message",
        method: "morph",
        template: await render(options),
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          channel.broadcastUpdateLaterTo("stream", { targets: ".message", ...options }),
        ),
    );
  });
});
