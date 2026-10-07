import { beforeAll, describe, expect, it } from "vitest";

import { FixtureResolver, TemplateHandlers } from "@blazetrails/actionview";

import { Base } from "../base.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";

class ImplicitRenderTestController extends Base {
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
    call: (_template: unknown, source: string) => `return ${JSON.stringify(source)};`,
  });
  ImplicitRenderTestController.prependViewPath(
    new FixtureResolver({
      "implicit_render_test/hello_world.html.html": "Hello world!",
    }),
  );
  ImplicitRenderTestController.layout(false);
});

describe("RenderImplicitActionTest", () => {
  it("render a simple action with new explicit call to render", async () => {
    const c = new ImplicitRenderTestController();
    await c.dispatch("helloWorld", makeRequest(), new Response());
    expect(c.responseBody).toBe("Hello world!");
    expect(c.status).toBe(200);
  });
});
