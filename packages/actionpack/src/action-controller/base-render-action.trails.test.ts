import { beforeAll, describe, expect, it } from "vitest";

import { FixtureResolver, Rendering as ActionViewRendering } from "@blazetrails/actionview";

import { Base } from "./base.js";
import {
  Rendering as AbstractControllerRendering,
  _processFormat as abstractProcessFormat,
} from "../abstract-controller/rendering.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";

class BasicController extends Base {
  async helloWorldAsString(): Promise<void> {
    await this.render("hello_world");
  }

  async helloWorldAsStringWithOptions(): Promise<void> {
    await this.render("hello_world", { status: 404 });
  }

  async helloWorldAsTemplatePath(): Promise<void> {
    await this.render("basic/hello_world");
  }
}

async function dispatch(c: Base, action: string): Promise<Base> {
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" };
  await c.dispatch(action, new Request(env), new Response());
  return c;
}

beforeAll(() => {
  BasicController.prependViewPath(
    new FixtureResolver({ "basic/hello_world.html.tse": "Hello world!" }),
  );
});

describe("ActionView::Rendering reaches ActionController::Base as an included module", () => {
  it("links ActionView::Rendering above AbstractController::Rendering, per base.rb:222-266", () => {
    const proto = BasicController.prototype as unknown as Record<string, unknown>;
    expect(ActionViewRendering.instanceMethod("_normalizeArgs")?.value).toBe(
      proto["_normalizeArgs"],
    );
    const superArgs = ActionViewRendering.superMethod(new BasicController(), "_normalizeArgs");
    expect(superArgs?.("x", { layout: "y" })).toEqual({ layout: "y" });
    expect(AbstractControllerRendering.instanceMethod("_normalizeArgs")?.value).not.toBe(
      proto["_normalizeArgs"],
    );
  });

  it("_process_format calls super into AbstractController::Rendering#_process_format", () => {
    const c = new BasicController();
    const calls: unknown[] = [];
    AbstractControllerRendering.defineMethod("_processFormat", (format: unknown) => {
      calls.push(format);
    });
    try {
      c._processFormat({ toSym: () => ":json", toString: () => "json" });
    } finally {
      AbstractControllerRendering.defineMethod("_processFormat", abstractProcessFormat);
    }
    expect(calls).toHaveLength(1);
    expect(c.lookupContext.formats).toEqual([":json"]);
  });
});

describe("RenderAction::RenderActionTest", () => {
  it("rendering an action using '<action>'", async () => {
    const c = await dispatch(new BasicController(), "helloWorldAsString");
    expect(c.responseBody).toBe("Hello world!");
    expect(c.response.status).toBe(200);
  });

  it("rendering an action using '<action>' and options", async () => {
    const c = await dispatch(new BasicController(), "helloWorldAsStringWithOptions");
    expect(c.responseBody).toBe("Hello world!");
    expect(c.response.status).toBe(404);
  });

  it("render with a slash renders a template, per rendering.rb:161-163", async () => {
    const c = await dispatch(new BasicController(), "helloWorldAsTemplatePath");
    expect(c.responseBody).toBe("Hello world!");
  });
});
