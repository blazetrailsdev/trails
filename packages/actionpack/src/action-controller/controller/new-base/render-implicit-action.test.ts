import { beforeEach, describe, it } from "vitest";
import { FileSystemResolver, FixtureResolver } from "@blazetrails/actionview";
import { assert, assertEqual, assertRaises } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { File, registerConstant } from "@blazetrails/ruby-compat";
import { ActionNotFound } from "../../../abstract-controller/base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("RenderImplicitAction", { name: "RenderImplicitAction" });

class SimpleController extends ApplicationController {
  static {
    this.viewPaths([
      new FixtureResolver({
        "render-implicit-action/simple/hello-world.html.tse": "Hello world!",
        "render-implicit-action/simple/hyphen-ated.html.tse": "Hello hyphen-ated!",
        "render-implicit-action/simple/not-implemented.html.tse": "Not Implemented",
      }),
      new FileSystemResolver(new URL("..", import.meta.url).pathname),
    ]);
  }

  helloWorld(): void {}
}

Object.defineProperty(SimpleController, "name", {
  value: "RenderImplicitAction::SimpleController",
});
controllerConstants.set("render_implicit_action/simple", SimpleController);

let t: InstanceType<typeof Rack.TestCase>;
const assertBody = (body: string): void => t.assertBody(body);
const assertStatus = (code: number): void => t.assertStatus(code);

class RenderImplicitActionTest extends Rack.TestCase {}

describe("RenderImplicitActionTest", () => {
  beforeEach(({ task }) => {
    t = new RenderImplicitActionTest(task.name);
  });

  it("render a simple action with new explicit call to render", async () => {
    await t.get("/render_implicit_action/simple/helloWorld");

    assertBody("Hello world!");
    assertStatus(200);
  });

  it("render an action with a missing method and has special characters", async () => {
    await t.get("/render_implicit_action/simple/hyphen-ated");

    assertBody("Hello hyphen-ated!");
    assertStatus(200);
  });

  it("render an action called not_implemented", async () => {
    await t.get("/render_implicit_action/simple/notImplemented");

    assertBody("Not Implemented");
    assertStatus(200);
  });

  it("render does not traverse the file system", async () => {
    await assertRaises([ActionNotFound], {}, async () => {
      const actionName = ["..", "..", "fixtures", "shared"].join(File.SEPARATOR);
      await SimpleController.action(actionName)(MockRequest.envFor("/"));
    });
  });

  it("available_action? returns true for implicit actions", () => {
    assert(new SimpleController().isAvailableAction("helloWorld"));
    assert(new SimpleController().isAvailableAction("hyphen-ated"));
    assert(new SimpleController().isAvailableAction("notImplemented"));
  });

  it("available_action? does not allow File::SEPARATOR on the name", () => {
    let actionName = ["evil", "..", "..", "path"].join(File.SEPARATOR);
    assertEqual(false, new SimpleController().isAvailableAction(actionName));

    actionName = ["evil", "path"].join(File.SEPARATOR);
    assertEqual(false, new SimpleController().isAvailableAction(actionName));
  });
});
