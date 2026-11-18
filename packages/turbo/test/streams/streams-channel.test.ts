/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/actioncable/channel/test-case.js";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { Thread, constSet, include } from "@blazetrails/ruby-compat";
import "../test-helper.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { ActionHelper } from "../../lib/app/helpers/turbo/streams/action-helper.js";
import { Debouncer } from "../../lib/app/models/turbo/debouncer.js";
import { ThreadDebouncer } from "../../lib/app/models/turbo/thread-debouncer.js";
import { Turbo } from "../../lib/turbo-trails.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import { Message } from "../dummy/app/models/message.js";

class StreamsChannelTest extends TestCase {}
include(StreamsChannelTest, ActiveJobTestHelper);
include(StreamsChannelTest, ActionHelper);
constSet(Turbo, "StreamsChannelTest", StreamsChannelTest);

type Ctx = { testCase: any };

const render = (options: object): Promise<unknown> => ApplicationController.render(options);

async function withProductionDebouncer(t: any, block: () => Promise<unknown>): Promise<void> {
  const old = ThreadDebouncer.debouncerClass;
  ThreadDebouncer.debouncerClass = Debouncer;
  try {
    await block();
  } finally {
    ThreadDebouncer.debouncerClass = old;
    await new Promise((resolve) => setTimeout(resolve, (Debouncer.DEFAULT_DELAY + 0.2) * 1000));

    const turboKeys = Thread.current()
      .keys()
      .filter((k) => k.startsWith("turbo-"));
    expect(turboKeys, "Thread-locals were not cleaned up").toEqual([]);
  }
}

const channel = StreamsChannel;

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

  for (const action of ["replace", "update", "append", "prepend"] as const) {
    const target = action === "replace" || action === "update" ? "message_1" : "messages";
    const method = `broadcast${action[0].toUpperCase()}${action.slice(1)}To` as const;
    it(`broadcasting ${action} now`, async ({ testCase: t }: Ctx) => {
      const options = { partial: "messages/message", locals: { message: "hello!" } };

      await t.assertBroadcastOn(
        "stream",
        t.turboStreamActionTag(action, { target, template: await render(options) }),
        () => (channel as any)[method]("stream", { target, ...options }),
      );

      await t.assertBroadcastOn(
        "stream",
        t.turboStreamActionTag(action, { targets: ".message", template: await render(options) }),
        () => (channel as any)[method]("stream", { targets: ".message", ...options }),
      );
    });

    const laterMethod = method.replace(/To$/, "LaterTo");
    it(`broadcasting ${action} later`, async ({ testCase: t }: Ctx) => {
      const options = { partial: "messages/message", locals: { message: "hello!" } };

      await t.assertBroadcastOn(
        "stream",
        t.turboStreamActionTag(action, { target, template: await render(options) }),
        () =>
          t.performEnqueuedJobs({}, () =>
            (channel as any)[laterMethod]("stream", { target, ...options }),
          ),
      );

      await t.assertBroadcastOn(
        "stream",
        t.turboStreamActionTag(action, { targets: ".message", template: await render(options) }),
        () =>
          t.performEnqueuedJobs({}, () =>
            (channel as any)[laterMethod]("stream", { targets: ".message", ...options }),
          ),
      );
    });
  }

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
    await withProductionDebouncer(t, () =>
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
    await withProductionDebouncer(t, () =>
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

  for (const later of [false, true]) {
    it(`broadcasting actions with method morph ${later ? "later" : "now"}`, async ({
      testCase: t,
    }: Ctx) => {
      const options = {
        attributes: { method: "morph" },
        partial: "messages/message",
        locals: { message: "hello!" },
      };

      for (const action of ["replace", "update"]) {
        const name = `broadcast${action[0].toUpperCase()}${action.slice(1)}${later ? "Later" : ""}To`;
        for (const targeting of [{ target: "message_1" }, { targets: ".message" }]) {
          const call = () => (channel as any)[name]("stream", { ...targeting, ...options });
          await t.assertBroadcastOn(
            "stream",
            t.turboStreamActionTag(action, {
              ...targeting,
              method: "morph",
              template: await render(options),
            }),
            later ? () => t.performEnqueuedJobs({}, call) : call,
          );
        }
      }
    });
  }
});
