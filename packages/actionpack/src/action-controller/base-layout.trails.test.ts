import { beforeAll, describe, expect, it } from "vitest";

import { FixtureResolver, MissingTemplate, TemplateHandlers } from "@blazetrails/actionview";

import { Base } from "./base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

class DefaultLayoutController extends Base {
  async hello(): Promise<void> {}
  async withItem(): Promise<void> {
    this.render({ action: "hello", layout: "item" });
  }
  async withNofile(): Promise<void> {
    this.render({ action: "hello", layout: "nofile" });
  }
}

class BareController extends Base {
  async hello(): Promise<void> {}
}

class NamedLayoutController extends DefaultLayoutController {}

async function dispatch(c: Base, action: string): Promise<unknown> {
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" };
  await c.dispatch(action, new Request(env), new Response());
  return c.body;
}

beforeAll(() => {
  TemplateHandlers.registerTemplateHandler("html", {
    extensions: ["html"],
    call: (_template: unknown, source: string) => JSON.stringify(source),
  });
  DefaultLayoutController.prependViewPath(
    new FixtureResolver({
      "default_layout/hello.html.html": "hello",
      "named_layout/hello.html.html": "hello",
      "layouts/application.html.html": "layout",
      "layouts/item.html.html": "item layout",
    }),
  );
  BareController.prependViewPath(new FixtureResolver({ "bare/hello.html.html": "hello" }));
  NamedLayoutController.layout = "missing";
});

describe("ActionController::Base#renderAsync layout", () => {
  it("renders through the default layout found under layouts/", async () => {
    expect(await dispatch(new DefaultLayoutController(), "hello")).toBe("layout");
  });

  it("renders bare when the default layout is not found", async () => {
    expect(await dispatch(new BareController(), "hello")).toBe("hello");
  });

  it("raises MissingTemplate for a class-level layout that does not exist", async () => {
    await expect(dispatch(new NamedLayoutController(), "hello")).rejects.toBeInstanceOf(
      MissingTemplate,
    );
  });

  it("normalizes an explicit layout name under layouts/", async () => {
    expect(await dispatch(new DefaultLayoutController(), "withItem")).toBe("item layout");
  });

  it("raises MissingTemplate for an explicit layout that does not exist", async () => {
    await expect(dispatch(new DefaultLayoutController(), "withNofile")).rejects.toBeInstanceOf(
      MissingTemplate,
    );
  });
});
