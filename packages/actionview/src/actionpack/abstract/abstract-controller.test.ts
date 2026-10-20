import { beforeEach, describe, expect, test } from "vitest";
import { include, underscore } from "@blazetrails/activesupport";
import { AbstractController } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";
import { Rendering } from "../../rendering.js";
import { Layouts } from "../../layouts.js";
import { ClassMethods as ViewPathsClassMethods, type ViewPathsClass } from "../../view-paths.js";
import { MissingTemplate } from "../../template/error.js";
import { Tse } from "../../template/handlers/tse.js";

const { ActionNotFound } = AbstractController;

function named<T extends abstract new (...args: never[]) => unknown>(klass: T, name: string): T {
  Object.defineProperty(klass, "name", { value: `AbstractController::Testing::${name}` });
  return klass;
}

const views = new FixtureResolver({
  "action-with-ivars.tse": "<%= myIvar %> from index_with_ivars.erb",
  "helper-test.tse": "Hello <%= helperyTest() %> : <%= includedMethod() %>",
  "index.tse": "Hello from index.erb",
  "naked-render.tse": "Hello from naked_render.erb",
  "with-final-newline.tse": "Hello from with_final_newline.erb\n",
  "layouts/application.tse": "Application Enter : <%= yield %> : Exit",
  "abstract_controller/testing/me3/formatted.html.tse": "Hello from me3/formatted.html.erb",
  "abstract_controller/testing/me3/index.tse": "Hello from me3/index.erb",
  "abstract_controller/testing/me4/index.tse": "Hello from me4/index.erb",
  "layouts/abstract-controller/testing/me4.tse": "Me4 Enter : <%= yield %> : Exit",
});

class SimpleController extends AbstractController.Base {}

class Me extends SimpleController {
  index(): string {
    this.responseBody = "Hello world";
    return "Something else";
  }
}

describe("TestBasic", () => {
  test("dispatching works", async () => {
    const controller = new Me();
    await controller.process("index");
    expect(controller.responseBody).toBe("Hello world");
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
class RenderingController extends AbstractController.Base {
  _prefixes(): string[] {
    return [];
  }

  render(options: unknown = {}): unknown {
    if (typeof options === "string") {
      options = { _templateName: options };
    }
    return Rendering.superMethod(this, "render")!(options);
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
interface RenderingController {
  renderToString(...args: unknown[]): unknown;
  renderToBody(options?: Record<string, unknown>): unknown;
}
include(RenderingController, AbstractController.Rendering);
include(RenderingController, Rendering);
(RenderingController as unknown as { appendViewPath(path: unknown): void }).appendViewPath(views);

class Me2 extends RenderingController {
  declare myIvar: string;

  index(): unknown {
    return this.render("index.erb");
  }

  withFinalNewline(): unknown {
    return this.render("with_final_newline.erb");
  }

  async indexToString(): Promise<void> {
    this.responseBody = (await this.renderToString("index")) as string;
  }

  actionWithIvars(): unknown {
    this.myIvar = "Hello";
    return this.render("action_with_ivars.erb");
  }

  nakedRender(): unknown {
    return this.render();
  }

  async renderingToBody(): Promise<void> {
    this.responseBody = (await this.renderToBody({ template: "naked-render" })) as string;
  }

  async renderingToString(): Promise<void> {
    this.responseBody = (await this.renderToString({ template: "naked-render" })) as string;
  }
}

describe("TestRenderingController", () => {
  let controller: Me2;

  beforeEach(() => {
    controller = new Me2();
  });

  test("rendering templates works", async () => {
    await controller.process("index");
    expect(String(controller.responseBody)).toBe("Hello from index.erb");
  });

  test("stripping final newline works", async () => {
    try {
      Tse.stripTrailingNewlines = true;
      await controller.process("withFinalNewline");
      expect(String(controller.responseBody)).toBe("Hello from with_final_newline.erb");
    } finally {
      Tse.stripTrailingNewlines = false;
    }
  });

  test("render_to_string works with a String as an argument", async () => {
    await controller.process("indexToString");
    expect(String(controller.responseBody)).toBe("Hello from index.erb");
  });

  test("rendering passes ivars to the view", async () => {
    await controller.process("actionWithIvars");
    expect(String(controller.responseBody)).toBe("Hello from index_with_ivars.erb");
  });

  test("rendering with no template name", async () => {
    await controller.process("nakedRender");
    expect(String(controller.responseBody)).toBe("Hello from naked_render.erb");
  });

  test("rendering to a rack body", async () => {
    await controller.process("renderingToBody");
    expect(String(controller.responseBody)).toBe("Hello from naked_render.erb");
  });

  test("rendering to a string", async () => {
    await controller.process("renderingToString");
    expect(String(controller.responseBody)).toBe("Hello from naked_render.erb");
  });
});

class PrefixedViews extends RenderingController {
  /** @internal */
  static prefix(): string {
    return underscore(this.name);
  }

  /** @internal */
  override _prefixes(): string[] {
    return [(this.constructor as typeof PrefixedViews).prefix()];
  }
}

const Me3 = named(
  class Me3 extends PrefixedViews {
    index(): unknown {
      return this.render();
    }

    formatted(): unknown {
      this.formats = [":html"];
      return this.render();
    }
  },
  "Me3",
);

describe("TestPrefixedViews", () => {
  let controller: InstanceType<typeof Me3>;

  beforeEach(() => {
    controller = new Me3();
  });

  test("templates are located inside their 'prefix' folder", async () => {
    await controller.process("index");
    expect(String(controller.responseBody)).toBe("Hello from me3/index.erb");
  });

  test("templates included their format", async () => {
    await controller.process("formatted");
    expect(String(controller.responseBody)).toBe("Hello from me3/formatted.html.erb");
  });
});

class OverridingLocalPrefixes extends AbstractController.Base {
  index(): unknown {
    return (this as unknown as RenderingController).render();
  }

  static localPrefixes(): string[] {
    return [
      ...ViewPathsClassMethods.localPrefixes.call(this as unknown as ViewPathsClass),
      "abstract_controller/testing/me3",
    ];
  }

  static Inheriting: typeof OverridingLocalPrefixes;
}
named(OverridingLocalPrefixes, "OverridingLocalPrefixes");
include(OverridingLocalPrefixes, AbstractController.Rendering);
include(OverridingLocalPrefixes, Rendering);
(OverridingLocalPrefixes as unknown as { appendViewPath(path: unknown): void }).appendViewPath(
  views,
);
OverridingLocalPrefixes.Inheriting = class Inheriting extends OverridingLocalPrefixes {};
Object.defineProperty(OverridingLocalPrefixes.Inheriting, "name", {
  value: "AbstractController::Testing::OverridingLocalPrefixes::Inheriting",
});

describe("OverridingLocalPrefixesTest", () => {
  test("overriding .local_prefixes adds prefix", async () => {
    const controller = new OverridingLocalPrefixes();
    await controller.process("index");
    expect(String(controller.responseBody)).toBe("Hello from me3/index.erb");
  });

  test(".local_prefixes is inherited", async () => {
    const controller = new OverridingLocalPrefixes.Inheriting();
    await controller.process("index");
    expect(String(controller.responseBody)).toBe("Hello from me3/index.erb");
  });
});

class WithLayouts extends PrefixedViews {
  /** @internal */
  static layout(formats: unknown): unknown {
    const findTemplate = (this as unknown as { findTemplate(...args: unknown[]): unknown })
      .findTemplate;
    try {
      return findTemplate.call(
        this,
        underscore(this.name),
        { formats },
        { _prefixes: ["layouts"] },
      );
    } catch (error) {
      if (!(error instanceof MissingTemplate)) throw error;
      try {
        return findTemplate.call(this, "application", { formats }, { _prefixes: ["layouts"] });
      } catch (error) {
        if (!(error instanceof MissingTemplate)) throw error;
      }
    }
    return undefined;
  }

  /** @internal */
  override renderToBody(options: Record<string, unknown> = {}): unknown {
    return Layouts.superMethod(this, "renderToBody")!(options);
  }
}
include(WithLayouts, Layouts);

const Me4 = named(
  class Me4 extends WithLayouts {
    index(): unknown {
      return this.render();
    }
  },
  "Me4",
);

describe("TestLayouts", () => {
  test.skip("layouts are included", async () => {
    // BLOCKED: layouts-inherited-writes-layout-method-at-first-construction
    const controller = new Me4();
    await controller.process("index");
    expect(String(controller.responseBody)).toBe("Me4 Enter : Hello from me4/index.erb : Exit");
  });
});

class DefaultRespondToActionController extends AbstractController.Base {
  index(): void {
    this.responseBody = "success";
  }
}

class ActionMissingRespondToActionController extends AbstractController.Base {
  /** @internal */
  actionMissing(_actionName: string): void {
    this.responseBody = "success";
  }
}

class RespondToActionController extends AbstractController.Base {
  index(): void {
    this.responseBody = "success";
  }

  fail(): void {
    this.responseBody = "fail";
  }

  /** @internal */
  override methodForAction(actionName: string): string | undefined {
    return (String(actionName) !== "fail" && actionName) || undefined;
  }
}

describe("TestRespondToAction", () => {
  async function assertDispatch(
    klass: new () => AbstractController.Base,
    body = "success",
    action = "index",
  ): Promise<void> {
    const controller = new klass();
    await controller.process(action);
    expect(controller.responseBody).toBe(body);
  }

  test("an arbitrary method is available as an action by default", async () => {
    await assertDispatch(DefaultRespondToActionController, "success", "index");
  });

  test("raises ActionNotFound when method does not exist and action_missing is not defined", async () => {
    await expect(new DefaultRespondToActionController().process("fail")).rejects.toThrow(
      ActionNotFound,
    );
  });

  test("dispatches to action_missing when method does not exist and action_missing is defined", async () => {
    await assertDispatch(ActionMissingRespondToActionController, "success", "ohai");
  });

  test("a method is available as an action if method_for_action returns true", async () => {
    await assertDispatch(RespondToActionController, "success", "index");
  });

  test("raises ActionNotFound if method is defined but method_for_action returns false", async () => {
    await expect(new RespondToActionController().process("fail")).rejects.toThrow(ActionNotFound);
  });
});

class Me6 extends AbstractController.Base {
  static {
    this.actionMethods();
  }

  index(): void {}
}

describe("TestActionMethodsReloading", () => {
  test("action_methods should be reloaded after defining a new method", () => {
    expect(new Set(Me6.actionMethods())).toEqual(new Set(["index"]));
  });
});
