import { describe, expect, it } from "vitest";

import { helper, type HelpersClassMethods } from "../abstract-controller/helpers.js";
import { Base } from "../action-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import { FIXTURE_LOAD_PATH } from "./abstract-unit.js";
import { GamesHelper } from "./fixtures/helpers/fun/games_helper.js";

class FixtureLoadPathController extends Base {
  async helloWorldWithLayout(): Promise<void> {
    this.render({ template: "test/hello_world", layout: "layouts/standard" });
  }

  async renderHelloWorld(): Promise<void> {
    this.render({ inline: "hello: <%= stratego() %>" });
  }
}
FixtureLoadPathController.prependViewPath(FIXTURE_LOAD_PATH);
helper(FixtureLoadPathController as unknown as HelpersClassMethods, GamesHelper);

async function dispatch(action: string): Promise<unknown> {
  const controller = new FixtureLoadPathController();
  const env = { REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" };
  await controller.dispatch(action, new Request(env), new Response());
  return controller.responseBody;
}

describe("FIXTURE_LOAD_PATH", () => {
  it("renders a template inside a fixture layout", async () => {
    expect(await dispatch("helloWorldWithLayout")).toBe("<html>Hello world!</html>\n");
  });

  it("renders through a fixture helper module", async () => {
    expect(await dispatch("renderHelloWorld")).toBe("hello: Iz guuut!");
  });
});
