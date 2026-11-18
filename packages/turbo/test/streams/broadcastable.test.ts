import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { TestCase } from "@blazetrails/actioncable/channel/test-case.js";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { assertNoChanges } from "@blazetrails/activesupport/testing/assertions";
import type { Included } from "@blazetrails/activesupport";
import { domId } from "@blazetrails/actionview/record-identifier.js";
import { Thread, constSet, include } from "@blazetrails/ruby-compat";
import { withProductionDebouncer } from "../test-helper.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { ActionHelper } from "../../lib/app/helpers/turbo/streams/action-helper.js";
import { Turbo } from "../../lib/turbo-trails.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import { Message } from "../dummy/app/models/message.js";
import type { Broadcastable } from "../../lib/app/models/concerns/turbo/broadcastable.js";
import { Profile } from "../dummy/app/models/users/profile.js";

class BroadcastableTest extends TestCase {}
include(BroadcastableTest, ActiveJobTestHelper);
include(BroadcastableTest, ActionHelper);
constSet(Turbo, "BroadcastableTest", BroadcastableTest);

class MessageThatRendersError extends Message {
  toPartialPath(): string {
    return "messages/raises_error";
  }
}

type Ctx = {
  testCase: BroadcastableTest & ActiveJobTestHelper & Included<typeof ActionHelper>;
};
type Broadcasting = Included<typeof Broadcastable> & { toGidParam(): string };

const render = ApplicationController.render.bind(ApplicationController);

describe("Turbo::BroadcastableTest", () => {
  let message: Message & Broadcasting;

  beforeAll(async () => {
    await Message.loadSchema();
  });

  beforeEach(() => {
    Turbo.currentRequestId = null;
    for (const key of Thread.current().keys()) {
      if (key.startsWith("turbo-")) Thread.current().set(key, null);
    }
    message = new Message({ id: 1, content: "Hello!" }) as Message & Broadcasting;
  });

  afterEach(async () => {
    await Message.deleteAll();
  });

  it("broadcasting ignores blank streamables", async ({ testCase: t }: Ctx) => {
    await t.assertNoBroadcasts(message.toGidParam(), async () => {
      await message.broadcastRemoveTo(null);
      await message.broadcastRemoveTo([null]);
      await message.broadcastRemoveTo("");
      await message.broadcastRemoveTo([""]);
    });
  });

  it("broadcasting later ignores blank streamables", async ({ testCase: t }: Ctx) => {
    await t.assertNoEnqueuedJobs({}, async () => {
      await message.broadcastAppendLaterTo(null);
      await message.broadcastAppendLaterTo([null]);
      await message.broadcastAppendLaterTo("");
      await message.broadcastAppendLaterTo([""]);
    });
  });

  it("broadcasting remove to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("remove", { target: "message_1" }),
      () => message.broadcastRemoveTo("stream"),
    );
  });

  it("broadcasting remove now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("remove", { target: "message_1" }),
      () => message.broadcastRemove(),
    );
  });

  it("broadcasting remove does not render contents", async ({ testCase: t }: Ctx) => {
    const message = new MessageThatRendersError({ id: 1 }) as MessageThatRendersError &
      Broadcasting;

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("remove", { target: domId(message) }),
      () => message.broadcastRemove(),
    );
  });

  it("broadcasting replace to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", { target: "message_1", template: await render(message) }),
      () => message.broadcastReplaceTo("stream"),
    );
  });

  it("broadcasting replace now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("replace", { target: "message_1", template: await render(message) }),
      () => message.broadcastReplace(),
    );
  });

  it("broadcasting update to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", { target: "message_1", template: await render(message) }),
      () => message.broadcastUpdateTo("stream"),
    );
  });

  it("broadcasting update to stream now with template option", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        target: "message_1",
        template: await render("messages/index", { layout: false }),
      }),
      () => message.broadcastUpdateTo("stream", { template: "messages/index" }),
    );
  });

  it("broadcasting update now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "message_1", template: await render(message) }),
      () => message.broadcastUpdate(),
    );
  });

  it("broadcasting before to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("before", { target: "message_1", template: await render(message) }),
      () => message.broadcastBeforeTo("stream", { target: "message_1" }),
    );
  });

  it("broadcasting after to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("after", { target: "message_1", template: await render(message) }),
      () => message.broadcastAfterTo("stream", { target: "message_1" }),
    );
  });

  it("broadcasting append to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", { target: "messages", template: await render(message) }),
      () => message.broadcastAppendTo("stream"),
    );
  });

  it("broadcasting append to stream with custom target now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("append", {
        target: "board_messages",
        template: await render(message),
      }),
      () => message.broadcastAppendTo("stream", { target: "board_messages" }),
    );
  });

  it("broadcasting append now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("append", { target: "messages", template: await render(message) }),
      () => message.broadcastAppend(),
    );
  });

  it("broadcasting prepend to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(message) }),
      () => message.broadcastPrependTo("stream"),
    );
  });

  it("broadcasting prepend to stream with custom target now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", {
        target: "board_messages",
        template: await render(message),
      }),
      () => message.broadcastPrependTo("stream", { target: "board_messages" }),
    );
  });

  it("broadcasting prepend now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(message) }),
      () => message.broadcastPrepend(),
    );
  });

  it("broadcasting refresh to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn("stream", t.turboStreamRefreshTag(), () =>
      message.broadcastRefreshTo("stream"),
    );
  });

  it("broadcasting refresh now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(message.toGidParam(), t.turboStreamRefreshTag(), () =>
      message.broadcastRefresh(),
    );
  });

  it("broadcasting refresh does not render contents", async ({ testCase: t }: Ctx) => {
    const message = new MessageThatRendersError({ id: 1 }) as MessageThatRendersError &
      Broadcasting;

    await t.assertBroadcastOn(message.toGidParam(), t.turboStreamActionTag("refresh"), () =>
      message.broadcastRefresh(),
    );
  });

  it("broadcasting refresh later is debounced", async ({ testCase: t }: Ctx) => {
    await withProductionDebouncer(() =>
      t.assertBroadcastOn(message.toGidParam(), t.turboStreamRefreshTag(), () =>
        t.assertBroadcasts(message.toGidParam(), 1, () =>
          t.performEnqueuedJobs({}, () =>
            assertNoChanges(
              () => Thread.current().keys().length,
              null,
              {},
              async () => {
                for (let i = 0; i < 3; i++) await message.broadcastRefreshLater();
                await StreamsChannel.refreshDebouncerFor(message).wait();
              },
            ),
          ),
        ),
      ),
    );
  });

  it("broadcasting action to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(message) }),
      () => message.broadcastActionTo("stream", { action: "prepend" }),
    );
  });

  it("broadcasting action now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { target: "messages", template: await render(message) }),
      () => message.broadcastAction("prepend"),
    );
  });

  it("broadcasting action with attributes", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", {
        target: "messages",
        template: await render(message),
        "data-foo": "bar",
      }),
      () =>
        message.broadcastAction("prepend", {
          target: "messages",
          attributes: { "data-foo": "bar" },
        }),
    );
  });

  it("broadcasting action with no rendering", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { target: "messages", template: null }),
      () => message.broadcastAction("prepend", { target: "messages", render: false }),
    );
  });

  it("broadcasting action to with attributes", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", {
        target: "messages",
        template: await render(message),
        "data-foo": "bar",
      }),
      () =>
        message.broadcastActionTo("stream", {
          action: "prepend",
          attributes: { "data-foo": "bar" },
        }),
    );
  });

  it("broadcasting action to with no rendering", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("prepend", { target: "messages", template: null }),
      () => message.broadcastActionTo("stream", { action: "prepend", render: false }),
    );
  });

  it("broadcasting action later to with attributes", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", {
        target: "messages",
        template: await render(message),
        "data-foo": "bar",
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastActionLaterTo(message, {
            action: "prepend",
            target: "messages",
            attributes: { "data-foo": "bar" },
          }),
        ),
    );
  });

  it("broadcasting action later to with no rendering", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { target: "messages", template: null }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastActionLaterTo(message, {
            action: "prepend",
            target: "messages",
            render: false,
          }),
        ),
    );
  });

  it("broadcasting action later with attributes", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", {
        target: "messages",
        template: await render(message),
        "data-foo": "bar",
      }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastActionLater({
            action: "prepend",
            target: "messages",
            attributes: { "data-foo": "bar" },
          }),
        ),
    );
  });

  it("broadcasting action later with no rendering", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { target: "messages", template: null }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastActionLater({ action: "prepend", target: "messages", render: false }),
        ),
    );
  });

  it("render correct local name in partial for namespaced models", async ({ testCase: t }: Ctx) => {
    const profile = new Profile({ id: 1, name: "Ryan" }) as Profile & Broadcasting;
    await t.assertBroadcastOn(
      profile.toParam(),
      t.turboStreamActionTag("replace", { target: "users_profile_1", template: "<p>Ryan</p>\n" }),
      () => profile.broadcastReplace(),
    );
  });

  it("local variables don't get overwritten if they collide with the template name", async ({
    testCase: t,
  }: Ctx) => {
    const profile = new Profile({ id: 1, name: "Ryan" }) as Profile & Broadcasting;
    await t.assertBroadcastOn(
      profile.toParam(),
      t.turboStreamActionTag("replace", {
        target: "users_profile_1",
        template: await render(message),
      }),
      () => profile.broadcastReplace({ partial: "messages/message", locals: { message: message } }),
    );
  });

  it("broadcast render now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("replace", { target: "message_1", template: "Goodbye!" }),
      () => message.broadcastRender(),
    );
  });

  it("broadcast render to stream now", async ({ testCase: t }: Ctx) => {
    const profile = new Profile({ id: 1, name: "Ryan" }) as Profile & Broadcasting;
    await t.assertBroadcastOn(
      profile.toParam(),
      t.turboStreamActionTag("replace", { target: "message_1", template: "Goodbye!" }),
      () => message.broadcastRenderTo(profile),
    );
  });

  it("broadcast_update to target string", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "unique_id", template: await render(message) }),
      () => message.broadcastUpdate({ target: "unique_id" }),
    );
  });

  it("broadcast_update to target object", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "message_1", template: await render(message) }),
      () => message.broadcastUpdate({ target: message }),
    );
  });

  it("broadcast_update to targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastUpdate({ targets: ".message_1" }),
    );
  });

  it("broadcast_update_to to target string", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "unique_id", template: await render(message) }),
      () => message.broadcastUpdateTo(message, { target: "unique_id" }),
    );
  });

  it("broadcast_update_to to target object", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "message_1", template: await render(message) }),
      () => message.broadcastUpdateTo(message, { target: message }),
    );
  });

  it("broadcast_update_to to targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastUpdateTo(message, { targets: ".message_1" }),
    );
  });

  it("broadcast_append to targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("append", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastAppend({ targets: ".message_1" }),
    );
  });

  it("broadcast_remove targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("remove", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastRemove({ targets: ".message_1" }),
    );
  });

  it("broadcast_append targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("append", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastAppend({ targets: ".message_1" }),
    );
  });

  it("broadcast_prepend targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("prepend", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastPrepend({ targets: ".message_1" }),
    );
  });

  it("broadcast_before_to targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("before", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastBeforeTo("stream", { targets: ".message_1" }),
    );
  });

  it("broadcast_after_to targets", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("after", { targets: ".message_1", template: await render(message) }),
      () => message.broadcastAfterTo("stream", { targets: ".message_1" }),
    );
  });

  it("broadcast_update_later", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "unique_id", template: await render(message) }),
      () => t.performEnqueuedJobs({}, () => message.broadcastUpdateLater({ target: "unique_id" })),
    );
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { targets: ".message_1", template: await render(message) }),
      () =>
        t.performEnqueuedJobs({}, () => message.broadcastUpdateLater({ targets: ".message_1" })),
    );
  });

  it("broadcast_update_later_to", async ({ testCase: t }: Ctx) => {
    await message.saveBang();

    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { target: "unique_id", template: await render(message) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastUpdateLaterTo(message, { target: "unique_id" }),
        ),
    );
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", { targets: ".message_1", template: await render(message) }),
      () =>
        t.performEnqueuedJobs({}, () =>
          message.broadcastUpdateLaterTo(message, { targets: ".message_1" }),
        ),
    );
  });

  it("broadcasting replace morph to stream now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("replace", {
        target: "message_1",
        method: "morph",
        template: await render(message),
      }),
      () =>
        message.broadcastReplaceTo("stream", {
          target: "message_1",
          attributes: { method: "morph" },
        }),
    );
  });
  it("broadcasting update morph to stream now targeting", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      "stream",
      t.turboStreamActionTag("update", {
        target: "message_1",
        method: "morph",
        template: await render(message),
      }),
      () =>
        message.broadcastUpdateTo("stream", {
          target: "message_1",
          attributes: { method: "morph" },
        }),
    );
  });
  it("broadcasting replace morph now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("replace", {
        target: "message_1",
        method: "morph",
        template: await render(message),
      }),
      () => message.broadcastReplace({ target: "message_1", attributes: { method: "morph" } }),
    );
  });
  it("broadcasting update morph now", async ({ testCase: t }: Ctx) => {
    await t.assertBroadcastOn(
      message.toGidParam(),
      t.turboStreamActionTag("update", {
        target: "message_1",
        method: "morph",
        template: await render(message),
      }),
      () => message.broadcastUpdate({ target: "message_1", attributes: { method: "morph" } }),
    );
  });
});
