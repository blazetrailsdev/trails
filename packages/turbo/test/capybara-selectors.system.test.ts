import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import { ApplicationSystemTestCase } from "./application-system-test-case.js";
import { Message } from "./dummy/app/models/message.js";
import { StreamsChannel } from "../lib/app/channels/turbo/streams-channel.js";
import type { SystemTestHelper } from "../lib/system-test-helper.js";

type Page = Awaited<ReturnType<ApplicationSystemTestCase["page"]>>;
type Helper = ApplicationSystemTestCase & {
  [K in keyof typeof SystemTestHelper]: (typeof SystemTestHelper)[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never;
};
type View = { rendered: unknown; render(options: object): Promise<unknown> };

describe("Turbo::TurboCableStreamSourceSelectorTest", () => {
  let t: Helper;
  let page: Page;
  let view: View;

  const renderHtml = async (html: string, localAssigns: object = {}) => {
    await view.render({ inline: html, locals: localAssigns });

    await page.setContent(String(view.rendered));
  };

  beforeEach(async ({ task }) => {
    await Message.loadSchema();
    t = new ApplicationSystemTestCase(task.name) as Helper;
    page = await t.page();
    view = new TestCase(expect.getState().currentTestName!) as unknown as View;
    await (view as unknown as { beforeSetup(): Promise<void> }).beforeSetup();
    (view as unknown as { setup(): void }).setup();
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it(":turbo_cable_stream_source matches signed-stream-name as a locator", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message });

    await t.assertTurboCableStreamSource({ count: 1 });
    await t.assertTurboCableStreamSource(message, { count: 1 });
    await t.assertTurboCableStreamSource([message], { count: 1 });
    await t.assertTurboCableStreamSource(StreamsChannel.signedStreamName(message), { count: 1 });
  }, 60_000);

  it(":turbo_cable_stream_source matches signed-stream-name with :signed_stream_name filter", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message });

    await t.assertTurboCableStreamSource({ count: 1 });
    await t.assertTurboCableStreamSource({ signedStreamName: message, count: 1 });
    await t.assertTurboCableStreamSource({ signedStreamName: [message], count: 1 });
    await t.assertTurboCableStreamSource({
      signedStreamName: StreamsChannel.signedStreamName(message),
      count: 1,
    });
  }, 60_000);

  it(":turbo_cable_stream_source matches channel with :channel filter", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message });

    await t.assertTurboCableStreamSource({ count: 1 });
    await t.assertTurboCableStreamSource({ channel: true });
    await t.assertTurboCableStreamSource({ channel: StreamsChannel });
    await t.assertTurboCableStreamSource({ channel: "Turbo::StreamsChannel" });
  }, 60_000);

  it(":turbo_cable_stream_source does not match signed-stream-name as a locator", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message: new Message({ id: 2 }) });

    await t.assertNoTurboCableStreamSource("junk", { count: 1 });
    await t.assertNoTurboCableStreamSource(message, { count: 1 });
    await t.assertNoTurboCableStreamSource([message], { count: 1 });
    await t.assertNoTurboCableStreamSource(StreamsChannel.signedStreamName(message), { count: 1 });
  }, 60_000);

  it(":turbo_cable_stream_source does not match signed-stream-name with :signed_stream_name filter", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message: new Message({ id: 2 }) });

    await t.assertNoTurboCableStreamSource({ signedStreamName: "junk", count: 1 });
    await t.assertNoTurboCableStreamSource({ signedStreamName: message, count: 1 });
    await t.assertNoTurboCableStreamSource({ signedStreamName: [message], count: 1 });
    await t.assertNoTurboCableStreamSource({
      signedStreamName: StreamsChannel.signedStreamName(message),
      count: 1,
    });
  }, 60_000);

  it(":turbo_cable_stream_source does not match channel with :channel filter", async () => {
    const message = new Message({ id: 1 });

    await renderHtml("<%= turboStreamFrom(message) %>\n", { message });

    await t.assertNoTurboCableStreamSource({ channel: false });
    await t.assertNoTurboCableStreamSource({ channel: Object });
    await t.assertNoTurboCableStreamSource({ channel: "Object" });
  }, 60_000);
});
