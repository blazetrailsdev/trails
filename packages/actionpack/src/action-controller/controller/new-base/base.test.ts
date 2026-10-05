import { assertEqual } from "@blazetrails/activesupport";
import { describe, it } from "vitest";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

class SimpleController extends Base {
  static {
    this.beforeAction("authenticate");
  }

  async index(): Promise<void> {
    await this.render({ body: "success" });
  }

  modify_response_body(): void {
    this.responseBody = "success";
  }

  modify_response_body_twice(): void {
    const ret = (this.responseBody = "success");
    this.responseBody = `${ret}!`;
  }

  modify_response_headers(): void {}

  async show_actions(): Promise<void> {
    await this.render({ body: `actions: ${[...this.actionMethods()].sort().join(", ")}` });
  }

  private authenticate(): void {}
}

class EmptyController extends Base {}
class SubEmptyController extends EmptyController {}
class NonDefaultPathController extends Base {
  static override controllerPath(): string {
    return "i_am_not_default";
  }
}

class ContainedEmptyController extends Base {}
class ContainedSubEmptyController extends ContainedEmptyController {}
class ContainedNonDefaultPathController extends Base {
  static override controllerPath(): string {
    return "i_am_extremely_not_default";
  }
}
const Submodule = {
  ContainedEmptyController,
  ContainedSubEmptyController,
  ContainedNonDefaultPathController,
};

for (const [klass, name] of [
  [SimpleController, "Dispatching::SimpleController"],
  [EmptyController, "Dispatching::EmptyController"],
  [SubEmptyController, "Dispatching::SubEmptyController"],
  [NonDefaultPathController, "Dispatching::NonDefaultPathController"],
  [ContainedEmptyController, "Dispatching::Submodule::ContainedEmptyController"],
  [ContainedSubEmptyController, "Dispatching::Submodule::ContainedSubEmptyController"],
  [ContainedNonDefaultPathController, "Dispatching::Submodule::ContainedNonDefaultPathController"],
] as const) {
  Object.defineProperty(klass, "name", { value: name });
}
controllerConstants.set("dispatching/simple", SimpleController);

class BaseTest extends Rack.TestCase {}

describe("BaseTest", () => {
  it("simple dispatching", async ({ task }) => {
    const t = new BaseTest(task.name);
    await t.get("/dispatching/simple/index");

    t.assertBody("success");
    t.assertStatus(200);
    t.assertContentType("text/plain; charset=utf-8");
  });

  it("directly modifying response body", async ({ task }) => {
    const t = new BaseTest(task.name);
    await t.get("/dispatching/simple/modify_response_body");

    t.assertBody("success");
  });

  it("directly modifying response body twice", async ({ task }) => {
    const t = new BaseTest(task.name);
    await t.get("/dispatching/simple/modify_response_body_twice");

    t.assertBody("success!");
  });

  it("controller path", () => {
    assertEqual("dispatching/empty", EmptyController.controllerPath());
    assertEqual(EmptyController.controllerPath(), new EmptyController().controllerPath());
  });

  it("non-default controller path", () => {
    assertEqual("i_am_not_default", NonDefaultPathController.controllerPath());
    assertEqual(
      NonDefaultPathController.controllerPath(),
      new NonDefaultPathController().controllerPath(),
    );
  });

  it("sub controller path", () => {
    assertEqual("dispatching/sub_empty", SubEmptyController.controllerPath());
    assertEqual(SubEmptyController.controllerPath(), new SubEmptyController().controllerPath());
  });

  it("namespaced controller path", () => {
    assertEqual(
      "dispatching/submodule/contained_empty",
      Submodule.ContainedEmptyController.controllerPath(),
    );
    assertEqual(
      Submodule.ContainedEmptyController.controllerPath(),
      new Submodule.ContainedEmptyController().controllerPath(),
    );
  });

  it("namespaced non-default controller path", () => {
    assertEqual(
      "i_am_extremely_not_default",
      Submodule.ContainedNonDefaultPathController.controllerPath(),
    );
    assertEqual(
      Submodule.ContainedNonDefaultPathController.controllerPath(),
      new Submodule.ContainedNonDefaultPathController().controllerPath(),
    );
  });

  it("namespaced sub controller path", () => {
    assertEqual(
      "dispatching/submodule/contained_sub_empty",
      Submodule.ContainedSubEmptyController.controllerPath(),
    );
    assertEqual(
      Submodule.ContainedSubEmptyController.controllerPath(),
      new Submodule.ContainedSubEmptyController().controllerPath(),
    );
  });

  it("controller name", () => {
    assertEqual("empty", EmptyController.controllerName());
    assertEqual("contained_empty", Submodule.ContainedEmptyController.controllerName());
  });

  it("non-default path controller name", () => {
    assertEqual("non_default_path", NonDefaultPathController.controllerName());
    assertEqual(
      "contained_non_default_path",
      Submodule.ContainedNonDefaultPathController.controllerName(),
    );
  });

  it("sub controller name", () => {
    assertEqual("sub_empty", SubEmptyController.controllerName());
    assertEqual("contained_sub_empty", Submodule.ContainedSubEmptyController.controllerName());
  });

  // BLOCKED: action-methods-does-not-subtract-internal-methods
  it.skip("action methods", () => {});
});
