/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import "../test-helper.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { StreamsHelper } from "../../lib/app/helpers/turbo/streams-helper.js";
import { Channel } from "../dummy/app/channels/application-cable/channel.js";
import { Message } from "../dummy/app/models/message.js";
import { ModelName } from "@blazetrails/activemodel";
import { Turbo } from "../../lib/turbo-trails.js";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    TestChannel?: typeof TestChannel;
  }
}

class TestChannel extends Channel {}
TopLevel.TestChannel = TestChannel;

type Tc = Record<string, any>;

class Component {
  id: number;
  content: string;
  static readonly modelName = new ModelName(this, Turbo, "Turbo::StreamsHelperTest::Component");

  constructor({ id, content }: { id: number; content: string }) {
    this.id = id;
    this.content = content;
  }

  get modelName(): ModelName {
    return Component.modelName;
  }

  renderIn(_viewContext: unknown): string {
    return this.content;
  }

  toKey(): unknown[] {
    return [this.id];
  }
}

class StreamsHelperTest extends TestCase {}
(StreamsHelperTest as any).tests(StreamsHelper);

describe("Turbo::StreamsHelperTest", () => {
  let tc: Tc;

  beforeEach(async ({ task }) => {
    tc = new (StreamsHelperTest as any)(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("turbo_stream builder captures block when called without :partial keyword", async () => {
    const rendered = await tc.turboStream.update("target_id", null, {}, () =>
      tc.tag().span("Hello, world"),
    );

    tc.assertDomEqual(
      `<turbo-stream action="update" target="target_id">
        <template>
          <span>Hello, world</span>
        </template>
      </turbo-stream>`,
      String(rendered),
    );
  });

  it("turbo_stream builder forwards block to partial when called with :partial keyword", async () => {
    const rendered = await tc.turboStream.update(
      "target_id",
      null,
      { partial: "application/partial_with_block" },
      () => "Hello, from application/partial_with_block partial",
    );

    tc.assertDomEqual(
      `<turbo-stream action="update" target="target_id">
        <template>
          <p>Hello, from application/partial_with_block partial</p>
        </template>
      </turbo-stream>`,
      String(rendered),
    );
  });

  it("turbo_stream builder forwards block to partial when called with :layout keyword", async () => {
    const rendered = await tc.turboStream.update(
      "target_id",
      null,
      { layout: "application/partial_with_block" },
      () => "Hello, from application/partial_with_block partial",
    );

    tc.assertDomEqual(
      `<turbo-stream action="update" target="target_id">
        <template>
          <p>Hello, from application/partial_with_block partial</p>
        </template>
      </turbo-stream>`,
      String(rendered),
    );
  });

  it("supports valid :renderable option object with nil content", async () => {
    const component = new Component({ id: 1, content: "Hello, world" });

    tc.assertDomEqual(
      `<turbo-stream action="update" target="streams_helper_test_component_1"><template>Hello, world</template></turbo-stream>`,
      String(await tc.turboStream.update(component)),
    );
  });

  it("supports valid :renderable option object with content", async () => {
    const component = new Component({ id: 1, content: "Hello, world" });

    tc.assertDomEqual(
      `<turbo-stream action="update" target="streams_helper_test_component_1"><template>Raw content</template></turbo-stream>`,
      String(await tc.turboStream.update(component, "Raw content")),
    );
  });

  it("with streamable", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="Turbo::StreamsChannel" signed-stream-name="${StreamsChannel.signedStreamName("messages")}"></turbo-cable-stream-source>`,
      String(tc.turboStreamFrom("messages")),
    );
  });

  it("with multiple streamables, some blank", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="Turbo::StreamsChannel" signed-stream-name="${StreamsChannel.signedStreamName(["channel", null, "", "messages"])}"></turbo-cable-stream-source>`,
      String(tc.turboStreamFrom("channel", null, "", "messages")),
    );
  });

  it("with invalid streamables", () => {
    expect(() => tc.turboStreamFrom("")).toThrow(new ArgumentError("streamables can't be blank"));

    expect(() => tc.turboStreamFrom(null)).toThrow(new ArgumentError("streamables can't be blank"));

    expect(() => tc.turboStreamFrom("", null)).toThrow(
      new ArgumentError("streamables can't be blank"),
    );
  });

  it("with streamable and html attributes", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="Turbo::StreamsChannel" signed-stream-name="${StreamsChannel.signedStreamName("messages")}" data-stream-target="source"></turbo-cable-stream-source>`,
      String(tc.turboStreamFrom("messages", { data: { stream_target: "source" } })),
    );
  });

  it("with channel", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="NonExistentChannel" signed-stream-name="${StreamsChannel.signedStreamName("messages")}"></turbo-cable-stream-source>`,
      String(tc.turboStreamFrom("messages", { channel: "NonExistentChannel" })),
    );
  });

  it("with channel as a class name", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="TestChannel" signed-stream-name="${StreamsChannel.signedStreamName("messages")}"></turbo-cable-stream-source>`,
      String(tc.turboStreamFrom("messages", { channel: TestChannel })),
    );
  });

  it("with channel and extra data", () => {
    tc.assertDomEqual(
      `<turbo-cable-stream-source channel="NonExistentChannel" signed-stream-name="${StreamsChannel.signedStreamName("messages")}" data-payload="1"></turbo-cable-stream-source>`,
      String(
        tc.turboStreamFrom("messages", { channel: "NonExistentChannel", data: { payload: 1 } }),
      ),
    );
  });
  it("turbo_stream.refresh", () => {
    tc.assertDomEqual(
      `<turbo-stream action="refresh"></turbo-stream>`,
      String(tc.turboStream.refresh()),
    );
    tc.assertDomEqual(
      `<turbo-stream request-id="abc123" action="refresh"></turbo-stream>`,
      String(Turbo.withRequestId("abc123", () => tc.turboStream.refresh())),
    );
    tc.assertDomEqual(
      `<turbo-stream request-id="def456" action="refresh"></turbo-stream>`,
      String(tc.turboStream.refresh({ requestId: "def456" })),
    );
  });

  it("custom turbo_stream builder actions", async () => {
    tc.assertDomEqual(
      `<turbo-stream action="highlight" target="an-id"><template></template></turbo-stream>`,
      String(await tc.turboStream.highlight("an-id")),
    );
    tc.assertDomEqual(
      `<turbo-stream action="highlight" targets=".a-selector"><template></template></turbo-stream>`,
      String(await tc.turboStream.highlightAll(".a-selector")),
    );
  });

  it("supports valid :partial option objects", async () => {
    await Message.loadSchema();
    const message = new Message({ id: 1, content: "Hello, world" });

    tc.assertDomEqual(
      `<turbo-stream action="update" target="message_1"><template><p>Hello, world</p></template></turbo-stream>`,
      String(await tc.turboStream.update(message)),
    );
  });
});
