// `ActionController::ImplicitRender` wired into `ActionController::Base`.
// Mirrors `ImplicitRenderTest` (`actionpack/test/controller/render_test.rb:817-847`)
// and `RenderImplicitActionTest`
// (`actionpack/test/controller/new_base/render_implicit_action_test.rb:16-43`).
import { beforeAll, describe, expect, it } from "vitest";

import { FixtureResolver, LookupContext, TemplateHandlers } from "@blazetrails/actionview";

import { Base } from "../base.js";
import { MissingExactTemplate } from "./exceptions.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";

class ImplicitRenderTestController extends Base {
  async emptyAction(): Promise<void> {}
  async helloWorld(): Promise<void> {}
}

function makeRequest(opts: Record<string, unknown> = {}): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    HTTP_HOST: "localhost",
    ...opts,
  });
}

beforeAll(() => {
  TemplateHandlers.registerTemplateHandler("html", {
    extensions: ["html"],
    render: (source: string) => source,
  });
  const ctx = new LookupContext();
  ctx.addResolver(
    new FixtureResolver({
      "implicit_render_test/helloWorld.html.html": "Hello world!",
    }),
  );
  ctx.setLayout(false);
  ImplicitRenderTestController.lookupContext = ctx;
});

describe("ImplicitRenderTest", () => {
  it("implicit no content response as browser", async () => {
    const c = new ImplicitRenderTestController();
    await expect(c.dispatch("emptyAction", makeRequest(), new Response())).rejects.toBeInstanceOf(
      MissingExactTemplate,
    );
  });

  it("implicit no content response as xhr", async () => {
    const c = new ImplicitRenderTestController();
    await c.dispatch(
      "emptyAction",
      makeRequest({ HTTP_X_REQUESTED_WITH: "XMLHttpRequest" }),
      new Response(),
    );
    expect(c.status).toBe(204);
  });
});

describe("RenderImplicitActionTest", () => {
  it("render a simple action with new explicit call to render", async () => {
    const c = new ImplicitRenderTestController();
    await c.dispatch("helloWorld", makeRequest(), new Response());
    expect(c.body).toBe("Hello world!");
    expect(c.status).toBe(200);
  });
});
