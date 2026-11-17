import { describe, expect, it } from "vitest";
import { ActionController, Mime } from "@blazetrails/actionpack";
import { rbModAncestors } from "@blazetrails/ruby-compat";
import "./test-helper.js";
import { Engine } from "../lib/engine.js";
import { StreamsChannel } from "../lib/app/channels/turbo/streams-channel.js";
import { StreamsHelper } from "../lib/app/helpers/turbo/streams-helper.js";

type Renderer = (this: object, html: string, options: object) => unknown;

describe("Turbo::Engine", () => {
  it("registers the turbo_stream mime type", () => {
    expect(Mime.get("turbo_stream")!.toString()).toBe("text/vnd.turbo-stream.html");
  });

  it("renders turbo_stream: html with the turbo_stream content type", () => {
    const render = (ActionController.Base.prototype as unknown as Record<string, Renderer>)[
      "_render_with_renderer_turbo_stream"
    ];
    const controller = { mediaType: null, contentType: null };

    expect(render.call(controller, "<turbo-stream></turbo-stream>", {})).toBe(
      "<turbo-stream></turbo-stream>",
    );
    expect(controller.contentType).toBe(Mime.get("turbo_stream"));
  });

  it("finds the helpers under lib/app/helpers", async () => {
    const helpers = await Engine.instance().helpers();
    expect(rbModAncestors(helpers)).toContain(StreamsHelper);
  });

  it("extends StreamName onto StreamsChannel without its ClassMethods constant", () => {
    expect(Object.hasOwn(StreamsChannel, "ClassMethods")).toBe(false);
  });
});
