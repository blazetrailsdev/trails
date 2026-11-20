import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { TestCase } from "@blazetrails/actioncable/channel/test-case.js";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { assertNoChanges } from "@blazetrails/activesupport/testing/assertions";
import type { Included } from "@blazetrails/activesupport";
import { domId } from "@blazetrails/actionview/record-identifier.js";
import { Thread, include } from "@blazetrails/ruby-compat";
import { withProductionDebouncer } from "../test-helper.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { ActionHelper } from "../../lib/app/helpers/turbo/streams/action-helper.js";
import { Turbo } from "../../lib/turbo-trails.js";
import { ApplicationController } from "../dummy/app/controllers/application-controller.js";
import { Message } from "../dummy/app/models/message.js";
import type { Broadcastable } from "../../lib/app/models/concerns/turbo/broadcastable.js";
import { Profile } from "../dummy/app/models/users/profile.js";
import { Article } from "../dummy/app/models/article.js";
import { Board } from "../dummy/app/models/board.js";
import { Comment } from "../dummy/app/models/comment.js";

class BroadcastableTest extends TestCase {}
include(BroadcastableTest, ActiveJobTestHelper);
include(BroadcastableTest, ActionHelper);
Object.assign(Turbo, { BroadcastableTest });

for (const name of [
  "BroadcastableArticleTest",
  "BroadcastableCommentTest",
  "BroadcastableBoardTest",
  "SuppressingBroadcastsTest",
]) {
  const klass = class extends TestCase {};
  include(klass, ActiveJobTestHelper);
  include(klass, ActionHelper);
  Object.assign(Turbo, { [name]: klass });
}

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

describe("Turbo::BroadcastableArticleTest", () => {
  beforeAll(async () => {
    await Article.loadSchema();
  });

  afterEach(async () => {
    await Article.deleteAll();
  });

  it("creating an article broadcasts to the overriden target with a string", async ({
    testCase: t,
  }: Ctx) => {
    await t.assertBroadcastOn(
      "overriden-stream",
      t.turboStreamActionTag("append", { target: "overriden-target", template: "<p>Body</p>\n" }),
      () => t.performEnqueuedJobs({}, () => Article.createBang({ body: "Body" })),
    );
  });

  it("updating an article broadcasts", async ({ testCase: t }: Ctx) => {
    const article = await Article.createBang({ body: "Hey" });

    await t.assertBroadcastOn(
      "ho",
      t.turboStreamActionTag("replace", {
        target: `article_${article.id}`,
        template: "<p>Ho</p>\n",
      }),
      () => t.performEnqueuedJobs({}, () => article.updateBang({ body: "Ho" })),
    );
  });

  it("destroying an article broadcasts", async ({ testCase: t }: Ctx) => {
    const article = await Article.createBang({ body: "Hey" });

    await t.assertBroadcastOn(
      "hey",
      t.turboStreamActionTag("remove", { target: `article_${article.id}` }),
      () => article.destroyBang(),
    );
  });
});

describe("Turbo::BroadcastableCommentTest", () => {
  let article: Article;

  beforeAll(async () => {
    await Article.loadSchema();
    await Comment.loadSchema();
  });

  beforeEach(async () => {
    article = await Article.createBang({ body: "Body" });
  });

  afterEach(async () => {
    await Comment.deleteAll();
    await Article.deleteAll();
  });

  it("creating a comment broadcasts to the overriden target with a lambda", async ({
    testCase: t,
  }: Ctx) => {
    const stream = `${article.toGidParam()}:comments`;
    const target = `article_${article.id}_comments`;

    await t.assertBroadcastOn(
      stream,
      t.turboStreamActionTag("append", {
        target: target,
        template: `<p class="different">comment</p>\n`,
      }),
      () => t.performEnqueuedJobs({}, () => article.comments.createBang({ body: "comment" })),
    );
  });

  it("creating a second comment while using locals broadcasts the second comment", async ({
    testCase: t,
  }: Ctx) => {
    const stream = `${article.toGidParam()}:comments`;
    const target = `article_${article.id}_comments`;

    await t.assertBroadcastOn(
      stream,
      t.turboStreamActionTag("append", {
        target: target,
        template: `<p class="different">comment</p>\n`,
      }),
      () => t.performEnqueuedJobs({}, () => article.comments.createBang({ body: "comment" })),
    );

    await t.assertBroadcastOn(
      stream,
      t.turboStreamActionTag("append", {
        target: target,
        template: `<p class="different">another comment</p>\n`,
      }),
      () =>
        t.performEnqueuedJobs({}, () => article.comments.createBang({ body: "another comment" })),
    );
  });

  it("updating a comment broadcasts", async ({ testCase: t }: Ctx) => {
    const comment = await article.comments.createBang({ body: "random" });
    const stream = `${article.toGidParam()}:comments`;
    const target = `comment_${comment.id}`;

    await t.assertBroadcastOn(
      stream,
      t.turboStreamActionTag("replace", {
        target: target,
        template: `<p class="different">precise</p>\n`,
      }),
      () => t.performEnqueuedJobs({}, () => comment.updateBang({ body: "precise" })),
    );
  });

  it("destroying a comment broadcasts", async ({ testCase: t }: Ctx) => {
    const comment = await article.comments.createBang({ body: "comment" });
    const stream = `${article.toGidParam()}:comments`;
    const target = `comment_${comment.id}`;

    await t.assertBroadcastOn(stream, t.turboStreamActionTag("remove", { target: target }), () =>
      comment.destroyBang(),
    );
  });
});

describe("Turbo::BroadcastableBoardTest", () => {
  beforeAll(async () => {
    await Board.loadSchema();
  });

  afterEach(async () => {
    await Board.deleteAll();
  });

  it("creating a board broadcasts refreshes to a channel using models plural name when creating", async ({
    testCase: t,
  }: Ctx) => {
    await t.assertBroadcastOn("boards", t.turboStreamActionTag("refresh"), () =>
      t.performEnqueuedJobs({}, async () => {
        await Board.createBang({ name: "Board" });
        await StreamsChannel.refreshDebouncerFor(["boards"]).wait();
      }),
    );
  });

  it("updating a board broadcasts to the models channel", async ({ testCase: t }: Ctx) => {
    const board = (await Board.suppressingTurboBroadcasts(() =>
      Board.createBang({ name: "Hey" }),
    )) as Board & Broadcasting;

    await t.assertBroadcastOn(board.toGidParam(), t.turboStreamActionTag("refresh"), () =>
      t.performEnqueuedJobs({}, async () => {
        await board.updateBang({ name: "Ho" });
        await StreamsChannel.refreshDebouncerFor(board).wait();
      }),
    );
  });

  it("destroying a board broadcasts refreshes to the model channel", async ({
    testCase: t,
  }: Ctx) => {
    const board = (await Board.suppressingTurboBroadcasts(() =>
      Board.createBang({ name: "Hey" }),
    )) as Board & Broadcasting;

    await t.assertBroadcastOn(board.toGidParam(), t.turboStreamActionTag("refresh"), () =>
      board.destroyBang(),
    );
  });
});

describe("Turbo::SuppressingBroadcastsTest", () => {
  let message: Message & Broadcasting;

  beforeEach(() => {
    message = new Message({ id: 1, content: "Hello!" }) as Message & Broadcasting;
  });

  async function assertNoBroadcastsWhenSuppressing(
    t: Ctx["testCase"],
    stream: string,
    block: () => unknown,
  ): Promise<void> {
    await t.assertNoBroadcasts(stream, () => Message.suppressingTurboBroadcasts(block));
  }

  async function assertNoBroadcastsLaterWhenSuppressing(
    t: Ctx["testCase"],
    stream: string,
    block: () => unknown,
  ): Promise<void> {
    await assertNoBroadcastsWhenSuppressing(t, stream, () => t.assertNoEnqueuedJobs({}, block));
  }

  it("suppressing broadcasting remove to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () => message.broadcastRemoveTo("stream"));
  });

  it("suppressing broadcasting remove now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastRemove(),
    );
  });

  it("suppressing broadcasting replace to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastReplaceTo("stream"),
    );
  });

  it("suppressing broadcasting replace to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastReplaceLaterTo("stream"),
    );
  });

  it("suppressing broadcasting replace now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastReplace(),
    );
  });

  it("suppressing broadcasting replace later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastReplaceLater(),
    );
  });

  it("suppressing broadcasting update to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () => message.broadcastUpdateTo("stream"));
  });

  it("suppressing broadcasting update to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastUpdateLaterTo("stream"),
    );
  });

  it("suppressing broadcasting update now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastUpdate(),
    );
  });

  it("suppressing broadcasting update later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastUpdateLater(),
    );
  });

  it("suppressing broadcasting before to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastBeforeTo("stream", { target: "message_1" }),
    );
  });

  it("suppressing broadcasting after to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastAfterTo("stream", { target: "message_1" }),
    );
  });

  it("suppressing broadcasting append to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () => message.broadcastAppendTo("stream"));
  });

  it("suppressing broadcasting append to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastAppendLaterTo("stream"),
    );
  });

  it("suppressing broadcasting append now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastAppend(),
    );
  });

  it("suppressing broadcasting append later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastAppendLater(),
    );
  });

  it("suppressing broadcasting prepend to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastPrependTo("stream"),
    );
  });

  it("suppressing broadcasting prepend to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastPrependLaterTo("stream"),
    );
  });

  it("suppressing broadcasting refresh to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastRefreshTo("stream"),
    );
  });

  it("suppressing broadcasting refresh to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastRefreshLaterTo("stream"),
    );
  });

  it("suppressing broadcasting prepend now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastPrepend(),
    );
  });

  it("suppressing broadcasting prepend later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastPrependLater(),
    );
  });

  it("suppressing broadcasting action to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () =>
      message.broadcastActionTo("stream", { action: "prepend" }),
    );
  });

  it("suppressing broadcasting action to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastActionLaterTo("stream", { action: "prepend" }),
    );
  });

  it("suppressing broadcasting action now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastAction("prepend"),
    );
  });

  it("suppressing broadcasting action later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastActionLater({ action: "prepend" }),
    );
  });

  it("suppressing broadcast render now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastRender(),
    );
  });

  it("suppressing broadcast render later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, message.toGidParam(), () =>
      message.broadcastRenderLater(),
    );
  });

  it("suppressing broadcast render to stream now", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsWhenSuppressing(t, "stream", () => message.broadcastRenderTo("stream"));
  });

  it("suppressing broadcast render to stream later", async ({ testCase: t }: Ctx) => {
    await assertNoBroadcastsLaterWhenSuppressing(t, "stream", () =>
      message.broadcastRenderLaterTo("stream"),
    );
  });
});
