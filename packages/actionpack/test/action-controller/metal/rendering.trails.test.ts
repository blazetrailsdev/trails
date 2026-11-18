import { describe, it, expect, expectTypeOf } from "vitest";
import { Base } from "../../../lib/action-controller/base.js";
import { Request } from "../../../lib/action-dispatch/http/request.js";
import { Response } from "../../../lib/action-dispatch/http/response.js";
import { include } from "@blazetrails/activesupport";
import { Rendering } from "../../../lib/action-controller/metal/rendering.js";
import type { ToModel } from "../../../lib/action-dispatch/routing/polymorphic-routes.js";

declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "render_types/post": { post: string; highlight?: boolean };
  }
}

class Host {
  declare _normalizeOptions: (options: Record<string, unknown>) => Record<string, unknown>;
}
Object.setPrototypeOf(Host.prototype, { _normalizeOptions: (options: unknown) => options });
include(Host, Rendering);
const _normalizeOptions = (options: Record<string, unknown>): Record<string, unknown> =>
  new Host()._normalizeOptions(options);

describe("Rendering#_normalize_options status", () => {
  it("maps both spellings of a Rack status symbol that RenderOptions admits", () => {
    expect(_normalizeOptions({ status: ":unprocessable_entity" }).status).toBe(422);
    expect(_normalizeOptions({ status: ":created" }).status).toBe(201);
    expect(_normalizeOptions({ status: "404 Not Found" }).status).toBe(404);
  });
});

describe("Head#head option keys (head.rb:33-35)", () => {
  it("sends the dashed header name for a camelCase, snake_case or dashed key", async () => {
    for (const key of ["xCustomHeader", "x_custom_header", "x-custom-header"]) {
      class KeyController extends Base {
        async show(): Promise<void> {
          await this.head(":ok", {
            [key]: "1",
            ETag: "e",
            "WWW-Authenticate": "w",
            ContentMD5: "m",
          });
        }
      }
      const controller = new KeyController();
      await controller.dispatch(
        "show",
        new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" }),
        await Response.new(),
      );
      expect(controller.response.headers.get("X-Custom-Header")).toBe("1");
      expect(controller.response.headers.get("ETag")).toBe("e");
      expect(controller.response.headers.get("WWW-Authenticate")).toBe("w");
      expect(controller.response.headers.get("ContentMD5")).toBe("m");
    }
  });
});

describe("Rendering#render types", () => {
  it("accepts rendering.rb's positional forms and option keys and rejects unknown ones", () => {
    const typed = async (controller: Base, post: ToModel): Promise<void> => {
      await controller.render();
      await controller.render("new");
      await controller.render("new", { status: ":unprocessable_entity", layout: false });
      await controller.render(post);
      await controller.render(controller.params.permit("action"));
      await controller.render({ action: "new", status: ":unprocessable_entity" });
      await controller.render({ template: "posts/show", formats: ["html"], layout: "admin" });
      await controller.render({ partial: "form", locals: { post }, status: 422 });
      await controller.render({ plain: "ok", status: ":created", contentType: "text/plain" });
      await controller.render({ html: "<b>ok</b>", status: "404 Not Found" });
      await controller.render({ json: { ok: true }, location: "/posts/1", status: 201 });
      await controller.render({ body: "raw", location: { action: "show", id: 1 } });
      // @ts-expect-error a misspelled option key
      await controller.render({ acton: "new" });
      // @ts-expect-error a misspelled option key after a positional action
      await controller.render("new", { statsu: 422 });
      // @ts-expect-error not a Rack status symbol
      await controller.render({ action: "new", status: "unprocessable" });
      // @ts-expect-error locals is a Hash
      await controller.render({ partial: "form", locals: "post" });
      // @ts-expect-error layout is a name, true or false
      await controller.render({ action: "new", layout: 1 });
      // @ts-expect-error formats names formats
      await controller.render({ action: "new", formats: 1 });
      // @ts-expect-error content_type is a String
      await controller.render({ plain: "ok", contentType: 1 });
      await controller.render({ partial: "render_types/post", locals: { post: "Hello" } });
      // @ts-expect-error a registered partial's required local is missing
      await controller.render({ partial: "render_types/post", locals: { highlight: true } });
      // @ts-expect-error a registered partial's local of the wrong type
      await controller.render({ partial: "render_types/post", locals: { post: 1 } });
      expectTypeOf(controller.render).returns.toEqualTypeOf<void | Promise<void>>();
    };
    expect(typed).toBeTypeOf("function");
  });
});

describe("Rendering#render_to_string types", () => {
  it("takes render's argument list and answers a string", () => {
    const typed = async (controller: Base): Promise<void> => {
      await controller.renderToString();
      await controller.renderToString("new");
      await controller.renderToString({ action: "new", status: ":unprocessable_entity" });
      await controller.renderToString({ partial: "render_types/post", locals: { post: "Hello" } });
      // @ts-expect-error a misspelled option key
      await controller.renderToString({ acton: "new" });
      // @ts-expect-error not a Rack status symbol
      await controller.renderToString({ action: "new", status: "unprocessable" });
      // @ts-expect-error a registered partial's local of the wrong type
      await controller.renderToString({ partial: "render_types/post", locals: { post: 1 } });
      expectTypeOf(controller.renderToString).returns.toEqualTypeOf<string | Promise<string>>();
    };
    expect(typed).toBeTypeOf("function");
  });
});
