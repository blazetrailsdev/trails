import { describe, expect, it } from "vitest";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { domId } from "@blazetrails/actionview";
import { extend, include, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { app } from "../test-helper.js";
import { Message } from "../dummy/app/models/message.js";
import { Profile } from "../dummy/app/models/users/profile.js";
import { MessageComponent } from "../dummy/app/components/message-component.js";
import { StreamName } from "../../lib/app/channels/turbo/streams/stream-name.js";
import type { SystemTestHelper } from "../../lib/system-test-helper.js";

type Page = Awaited<ReturnType<ApplicationSystemTestCase["page"]>>;
type Broadcasting = {
  broadcastAppendTo(...args: unknown[]): Promise<unknown>;
  broadcastActionTo(...args: unknown[]): Promise<unknown>;
  broadcastActionLaterTo(...args: unknown[]): Promise<unknown>;
  broadcastUpdate(rendering?: object): Promise<unknown>;
};

class BroadcastsTest extends ApplicationSystemTestCase {
  declare static signedStreamName: (streamables: unknown) => string;
  declare connectTurboCableStreamSources: (typeof SystemTestHelper)["connectTurboCableStreamSources"];

  static {
    include(this, ActiveJobTestHelper);
    extend(this, StreamName);
  }
}
TopLevel.BroadcastsTest = BroadcastsTest;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    BroadcastsTest?: typeof BroadcastsTest;
  }
}

type Ctx = { testCase: BroadcastsTest & ActiveJobTestHelper };

describe("BroadcastsTest", () => {
  let t: BroadcastsTest & ActiveJobTestHelper;
  let page: Page;

  const urlHelpers = () =>
    app.routes().urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
  const setup = async (testCase: BroadcastsTest & ActiveJobTestHelper) => {
    t = testCase;
    page = await t.page();
    app.reloadRoutesUnlessLoaded();
  };
  const visit = async (path: string) => {
    await t.goto(path);
  };
  const text = async () => (await page.locator("body").textContent()) ?? "";
  const within = (id: string) => page.locator(`[id="${id}"]`);
  const assertText = (locator: ReturnType<typeof within>, content: string) =>
    expect.poll(() => locator.textContent()).toContain(content);
  const assertNoText = (locator: ReturnType<typeof within>, content: string) =>
    expect.poll(() => locator.textContent()).not.toContain(content);
  const create = async (attributes: Record<string, unknown>) =>
    (await Message.create(attributes)) as unknown as Message & Broadcasting;

  const reconnectCableStreamSource = async ({ from, to }: { from: unknown; to: unknown }) => {
    const cableStreamSource = page.locator(
      `turbo-cable-stream-source[signed-stream-name="${BroadcastsTest.signedStreamName(from)}"]`,
    );

    await cableStreamSource.evaluate(
      (element, signedStreamName) => element.setAttribute("signed-stream-name", signedStreamName),
      BroadcastsTest.signedStreamName(to),
    );
  };

  const assertBroadcastsText = async (
    content: string,
    { to }: { to: string },
    block: (text: string, target: string) => Promise<unknown>,
  ) => {
    await assertNoText(within(to), content);

    await block(content, to);

    await assertText(within(to), content);
  };

  const assertForwardsTurboStreamTagAttribute = async (
    { attrKey, attrValue, to }: { attrKey: string; attrValue: string; to: string },
    block: (attrKey: string, attrValue: string, target: string) => Promise<unknown>,
  ) => {
    await page.evaluate(
      ([attrKey, to]) => {
        (
          window as unknown as { Turbo: { StreamActions: Record<string, () => void> } }
        ).Turbo.StreamActions.test = function (this: Element) {
          const attribute = this.getAttribute(attrKey);

          document.getElementById(to)!.innerHTML = attribute!;
        };
      },
      [attrKey, to],
    );

    await assertNoText(within(to), attrValue);

    await block(attrKey, attrValue, to);

    await assertText(within(to), attrValue);
  };

  it("Message broadcasts Turbo Streams", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertBroadcastsText("Message 1", { to: "messages" }, async (text, target) =>
      (await create({ content: text })).broadcastAppendTo(target),
    );
  }, 60_000);

  it("Message broadcasts with html: render option", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertBroadcastsText(
      "Hello, with html: option",
      { to: "messages" },
      async (text, target) =>
        (await create({ content: "Ignored" })).broadcastAppendTo(target, { html: text }),
    );
  }, 60_000);

  it("Message broadcasts with renderable: render option", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertBroadcastsText("Test message", { to: "messages" }, async (text, target) =>
      (await create({ content: "Ignored" })).broadcastAppendTo(target, {
        renderable: new MessageComponent(text),
      }),
    );
  }, 60_000);

  it("Does not render the layout twice when passed a component", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await (
      await create({ content: "Ignored" })
    ).broadcastAppendTo("messages", { renderable: new MessageComponent("test") });

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.querySelectorAll("title")].filter((title) =>
              title.textContent.includes("Dummy"),
            ).length,
        ),
      )
      .toBe(1);
  }, 60_000);

  it("Message broadcasts with extra attributes to turbo stream tag", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertBroadcastsText("Message 1", { to: "messages" }, async (text, target) =>
      (await create({ content: text })).broadcastActionTo(target, {
        action: "append",
        attributes: { "data-foo": "bar" },
      }),
    );
  }, 60_000);

  it("Message broadcasts with correct extra attributes to turbo stream tag", async ({
    testCase,
  }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertForwardsTurboStreamTagAttribute(
      { attrKey: "data-foo", attrValue: "bar", to: "messages" },
      async (attrKey, attrValue, target) =>
        (await create({ content: await text() })).broadcastActionTo(target, {
          action: "test",
          attributes: { [attrKey]: attrValue },
        }),
    );
  }, 60_000);

  it("Message broadcasts with no rendering", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await assertForwardsTurboStreamTagAttribute(
      { attrKey: "data-foo", attrValue: "bar", to: "messages" },
      async (attrKey, attrValue, target) =>
        (await create({ content: await text() })).broadcastActionTo(target, {
          action: "test",
          render: false,
          partial: "non_existant",
          attributes: { [attrKey]: attrValue },
        }),
    );
  }, 60_000);

  it("Message broadcasts later with extra attributes to turbo stream tag", async ({
    testCase,
  }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await t.performEnqueuedJobs({}, () =>
      assertBroadcastsText("Message 1", { to: "messages" }, async (text, target) =>
        (await create({ content: text })).broadcastActionLaterTo(target, {
          action: "append",
          attributes: { "data-foo": "bar" },
        }),
      ),
    );
  }, 60_000);

  it("Message broadcasts later with correct extra attributes to turbo stream tag", async ({
    testCase,
  }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await t.performEnqueuedJobs({}, () =>
      assertForwardsTurboStreamTagAttribute(
        { attrKey: "data-foo", attrValue: "bar", to: "messages" },
        async (attrKey, attrValue, target) =>
          (await create({ content: await text() })).broadcastActionLaterTo(target, {
            action: "test",
            attributes: { [attrKey]: attrValue },
          }),
      ),
    );
  }, 60_000);

  it("Message broadcasts later with no rendering", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().messagesPath());

    await t.performEnqueuedJobs({}, () =>
      assertForwardsTurboStreamTagAttribute(
        { attrKey: "data-foo", attrValue: "bar", to: "messages" },
        async (attrKey, attrValue, target) =>
          (await create({ content: await text() })).broadcastActionTo(target, {
            action: "test",
            render: false,
            partial: "non_existant",
            attributes: { [attrKey]: attrValue },
          }),
      ),
    );
  }, 60_000);

  it("Users::Profile broadcasts Turbo Streams", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().usersProfilesPath());

    await assertBroadcastsText("Profile 1", { to: "users_profiles" }, async (text, target) =>
      (new Profile({ id: 1, name: text }) as unknown as Broadcasting).broadcastAppendTo(target),
    );
  }, 60_000);

  it("passing extra parameters to channel", async ({ testCase }: Ctx) => {
    await setup(testCase);
    await visit(urlHelpers().sectionMessagesPath());

    await assertBroadcastsText("In a section", { to: "messages" }, async (text) =>
      (await create({ content: text })).broadcastAppendTo("important_messages"),
    );
  }, 60_000);

  it("the turbo-cable-stream-source observes attribute changes", async ({ testCase }: Ctx) => {
    await setup(testCase);
    const [original, broadcasted] = (await Message.createBang([
      { content: "original content" },
      { content: "broadcasted content" },
    ])) as unknown as (Message & Broadcasting)[];

    await visit(urlHelpers().messagePath(original));
    await reconnectCableStreamSource({ from: original, to: broadcasted });

    await assertText(page.locator("body"), original.content!);
    await assertBroadcastsText(broadcasted.content!, { to: domId(original) }, () =>
      broadcasted.broadcastUpdate({ target: domId(original) }),
    );
    await assertNoText(page.locator("body"), original.content!);
  }, 60_000);
});
