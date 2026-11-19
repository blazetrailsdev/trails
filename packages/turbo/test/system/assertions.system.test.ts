import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vite } from "../../../actionpack/lib/action-dispatch/system-testing/server.js";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { app } from "../test-helper.js";
import { Message } from "../dummy/app/models/message.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import type { SystemTestHelper } from "../../lib/system-test-helper.js";

type Page = Awaited<ReturnType<ApplicationSystemTestCase["page"]>>;
type Helper = ApplicationSystemTestCase & {
  [K in keyof typeof SystemTestHelper]: (typeof SystemTestHelper)[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never;
};

describe("AssertionsTest", () => {
  let t: Helper;
  let page: Page;

  const urlHelpers = () =>
    app.routes().urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
  const visit = async (path: string) => {
    await page.goto(new URL(path, vite.url).href);
    await t.connectTurboCableStreamSources();
  };

  beforeEach(async () => {
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!) as Helper;
    page = await t.page();
    app.reloadRoutesUnlessLoaded();
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("#assert_turbo_cable_stream_source treats the locator as :signed_stream_name filter", async () => {
    const message = await Message.createBang();

    await visit(urlHelpers().messagePath(message));

    await t.assertTurboCableStreamSource(message, { count: 1 });
    await t.assertNoTurboCableStreamSource("junk");
  }, 60_000);

  it.skip("#assert_turbo_cable_stream_source supports String collection filters", async () => {
    await visit(urlHelpers().messagesPath());

    await t.assertTurboCableStreamSource({ connected: true, count: 1 });
    await t.assertTurboCableStreamSource({ channel: StreamsChannel, count: 1 });
    await t.assertTurboCableStreamSource({
      signedStreamName: StreamsChannel.signedStreamName("messages"),
      count: 1,
    });
    await t.assertNoTurboCableStreamSource({ connected: false });
    await t.assertNoTurboCableStreamSource({ channel: "junk" });
    await t.assertNoTurboCableStreamSource({
      signedStreamName: StreamsChannel.signedStreamName("junk"),
    });
  }, 60_000);

  it("#assert_turbo_cable_stream_source supports record filters", async () => {
    const message = await Message.createBang();

    await visit(urlHelpers().messagePath(message));

    await t.assertTurboCableStreamSource({ signedStreamName: message });
    await t.assertTurboCableStreamSource({ signedStreamName: [message] });
    await t.assertTurboCableStreamSource({
      signedStreamName: StreamsChannel.signedStreamName(message),
    });
    await t.assertNoTurboCableStreamSource({ signedStreamName: [message, "junk"] });
  }, 60_000);
});
