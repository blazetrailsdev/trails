import { describe, expect, it } from "vitest";
import { ActionController, Mime } from "@blazetrails/actionpack";
import "./test-helper.js";

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
    expect(controller.contentType).toBe("text/vnd.turbo-stream.html");
  });
});
