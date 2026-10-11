import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { registerConstant } from "@blazetrails/ruby-compat";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";
import { TestRenderable } from "../../../test-helpers/lib/test-renderable.js";

registerConstant("ControllerLayouts", { name: "ControllerLayouts" });

class ImplicitController extends ApplicationController {
  static {
    Object.defineProperty(this, "name", { value: "ControllerLayouts::ImplicitController" });
    this.viewPaths([
      new FixtureResolver({
        "layouts/application.html.tse": "Main <%= yield %> Layout",
        "layouts/override.html.tse": "Override! <%= yield %>",
        "basic.html.tse": "Hello world!",
        "controller-layouts/implicit/layout-false.html.tse": "hi(layout_false.html.erb)",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ template: "basic" });
  }

  async override(): Promise<void> {
    await this.render({ template: "basic", layout: "override" });
  }

  async overrideRenderable(): Promise<void> {
    await this.render(new TestRenderable(), { layout: "override" });
  }

  async layoutFalse(): Promise<void> {
    await this.render({ layout: false });
  }

  builderOverride(): void {}
}

class ImplicitNameController extends ApplicationController {
  static {
    Object.defineProperty(this, "name", { value: "ControllerLayouts::ImplicitNameController" });
    this.viewPaths([
      new FixtureResolver({
        "layouts/controller-layouts/implicit-name.html.tse": "Implicit <%= yield %> Layout",
        "basic.html.tse": "Hello world!",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ template: "basic" });
  }

  async renderable(): Promise<void> {
    await this.render(new TestRenderable());
  }
}

controllerConstants.set("controller_layouts/implicit", ImplicitController);
controllerConstants.set("controller_layouts/implicit_name", ImplicitNameController);

class RenderLayoutTest extends Rack.TestCase {}

describe("RenderLayoutTest", () => {
  let t: RenderLayoutTest;

  beforeEach(({ task }) => {
    t = new RenderLayoutTest(task.name);
  });

  it("rendering a normal template, but using the implicit layout", async () => {
    await t.get("/controller_layouts/implicit/index");

    t.assertBody("Main Hello world! Layout");
    t.assertStatus(200);
  });

  it("rendering a normal template, but using an implicit NAMED layout", async () => {
    await t.get("/controller_layouts/implicit_name/index");

    t.assertBody("Implicit Hello world! Layout");
    t.assertStatus(200);
  });

  it("rendering a renderable object, using the implicit layout", async () => {
    await t.get("/controller_layouts/implicit_name/renderable");

    t.assertBody("Implicit Hello, World! Layout");
    t.assertStatus(200);
  });

  it("rendering a renderable object, using the override layout", async () => {
    await t.get("/controller_layouts/implicit/overrideRenderable");

    t.assertBody("Override! Hello, World!");
    t.assertStatus(200);
  });

  it("overriding an implicit layout with render :layout option", async () => {
    await t.get("/controller_layouts/implicit/override");
    t.assertBody("Override! Hello world!");
  });
});

class LayoutOptionsTest extends Rack.TestCase {
  static {
    this.testing(ImplicitController);
  }
}

describe("LayoutOptionsTest", () => {
  let t: LayoutOptionsTest;

  beforeEach(({ task }) => {
    t = new LayoutOptionsTest(task.name);
  });

  it("rendering with :layout => false leaves out the implicit layout", async () => {
    await t.get(":layoutFalse");
    t.assertResponse("hi(layout_false.html.erb)");
  });
});

class MismatchFormatController extends ApplicationController {
  static {
    Object.defineProperty(this, "name", { value: "ControllerLayouts::MismatchFormatController" });
    this.viewPaths([
      new FixtureResolver({
        "layouts/application.html.tse": "<html><%= yield %></html>",
        "controller-layouts/mismatch-format/index.xml.builder": "xml.instruct!",
        "controller-layouts/mismatch-format/implicit.builder": "xml.instruct!",
        "controller-layouts/mismatch-format/explicit.js.tse": "alert('foo');",
      }),
    ]);
  }

  async explicit(): Promise<void> {
    await this.render({ layout: "application" });
  }
}

controllerConstants.set("controller_layouts/mismatch_format", MismatchFormatController);

class MismatchFormatTest extends Rack.TestCase {
  static {
    this.testing(MismatchFormatController);
  }

  static XML_INSTRUCT = '<?xml version="1.0" encoding="UTF-8"?>\n';
}

describe("MismatchFormatTest", () => {
  let t: MismatchFormatTest;

  beforeEach(({ task }) => {
    t = new MismatchFormatTest(task.name);
  });

  // BLOCKED: builder-template-handler-and-actionpack-builder-fixtures
  it.skip("if XML is selected, an HTML template is not also selected", async () => {
    await t.get(":index", { params: { format: "xml" } });
    t.assertResponse(MismatchFormatTest.XML_INSTRUCT);
  });

  // BLOCKED: builder-template-handler-and-actionpack-builder-fixtures
  it.skip("if XML is implicitly selected, an HTML template is not also selected", async () => {
    await t.get(":implicit");
    t.assertResponse(MismatchFormatTest.XML_INSTRUCT);
  });

  it("a layout for JS is ignored even if explicitly provided for HTML", async () => {
    await t.get(":explicit", { params: { format: "js" } });
    t.assertResponse("alert('foo');");
  });
});

class FalseLayoutMethodController extends ApplicationController {
  static {
    Object.defineProperty(this, "name", {
      value: "ControllerLayouts::FalseLayoutMethodController",
    });
    this.viewPaths([
      new FixtureResolver({
        "controller-layouts/false-layout-method/index.js.tse": "alert('foo');",
      }),
    ]);

    this.layout(":isWhichLayout");
  }

  isWhichLayout(): false {
    return false;
  }

  index(): void {}
}

controllerConstants.set("controller_layouts/false_layout_method", FalseLayoutMethodController);

class FalseLayoutMethodTest extends Rack.TestCase {
  static {
    this.testing(FalseLayoutMethodController);
  }
}

describe("FalseLayoutMethodTest", () => {
  let t: FalseLayoutMethodTest;

  beforeEach(({ task }) => {
    t = new FalseLayoutMethodTest(task.name);
  });

  it("access false layout returned by a method/proc", async () => {
    await t.get(":index", { params: { format: "js" } });
    t.assertResponse("alert('foo');");
  });
});
