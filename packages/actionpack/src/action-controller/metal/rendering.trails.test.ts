import { describe, it, expect, expectTypeOf } from "vitest";
import type { Base } from "../base.js";
import { _normalizeOptions } from "./rendering.js";
import type { ToModel } from "../../action-dispatch/routing/polymorphic-routes.js";

declare module "@blazetrails/actionview" {
  interface TemplateRegistry {
    "render_types/post": { post: string; highlight?: boolean };
  }
}

describe("Rendering#_normalize_options status", () => {
  it("maps both spellings of a Rack status symbol that RenderOptions admits", () => {
    expect(_normalizeOptions({ status: "unprocessable_entity" }).status).toBe(422);
    expect(_normalizeOptions({ status: ":created" }).status).toBe(201);
    expect(_normalizeOptions({ status: "404 Not Found" }).status).toBe(404);
  });
});

describe("Rendering#render types", () => {
  it("accepts rendering.rb's positional forms and option keys and rejects unknown ones", () => {
    const typed = (controller: Base, post: ToModel): void => {
      controller.render();
      controller.render("new");
      controller.render("new", { status: "unprocessable_entity", layout: false });
      controller.render(post);
      controller.render(controller.params.permit("action"));
      controller.render({ action: "new", status: "unprocessable_entity" });
      controller.render({ template: "posts/show", formats: ["html"], layout: "admin" });
      controller.render({ partial: "form", locals: { post }, status: 422 });
      controller.render({ plain: "ok", status: ":created", contentType: "text/plain" });
      controller.render({ html: "<b>ok</b>", status: "404 Not Found" });
      controller.render({ json: { ok: true }, location: "/posts/1", status: 201 });
      controller.render({ body: "raw", location: { action: "show", id: 1 } });
      // @ts-expect-error a misspelled option key
      controller.render({ acton: "new" });
      // @ts-expect-error a misspelled option key after a positional action
      controller.render("new", { statsu: 422 });
      // @ts-expect-error not a Rack status symbol
      controller.render({ action: "new", status: "unprocessable" });
      // @ts-expect-error locals is a Hash
      controller.render({ partial: "form", locals: "post" });
      // @ts-expect-error layout is a name, true or false
      controller.render({ action: "new", layout: 1 });
      // @ts-expect-error formats names formats
      controller.render({ action: "new", formats: 1 });
      // @ts-expect-error content_type is a String
      controller.render({ plain: "ok", contentType: 1 });
      controller.render({ partial: "render_types/post", locals: { post: "Hello" } });
      // @ts-expect-error a registered partial's required local is missing
      controller.render({ partial: "render_types/post", locals: { highlight: true } });
      // @ts-expect-error a registered partial's local of the wrong type
      controller.render({ partial: "render_types/post", locals: { post: 1 } });
      expectTypeOf(controller.render).returns.toEqualTypeOf<void | Promise<void>>();
    };
    expect(typed).toBeTypeOf("function");
  });
});
