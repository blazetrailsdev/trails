/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import "../test-helper.js";
import { StreamsChannel } from "../../lib/app/channels/turbo/streams-channel.js";
import { StreamsHelper } from "../../lib/app/helpers/turbo/streams-helper.js";
import { Channel } from "../dummy/app/channels/application-cable/channel.js";

class TestChannel extends Channel {}
constSet(TopLevel, "TestChannel", TestChannel);

type Tc = Record<string, any>;

class StreamsHelperTest extends TestCase {}
(StreamsHelperTest as any).tests(StreamsHelper);

describe("Turbo::StreamsHelperTest", () => {
  let tc: Tc;

  beforeEach(async ({ task }) => {
    tc = new (StreamsHelperTest as any)(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
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
});
