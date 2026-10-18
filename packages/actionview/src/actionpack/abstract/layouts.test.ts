import { describe, expect, test } from "vitest";
import { include } from "@blazetrails/activesupport";
import { AbstractController } from "@blazetrails/actionpack";
import { ArgumentError, NameError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { FixtureResolver } from "../../testing/resolvers.js";
import { Rendering } from "../../rendering.js";
import { Layouts } from "../../layouts.js";
import { MissingTemplate } from "../../template/error.js";
import { Text } from "../../template/text.js";

function named<T extends abstract new (...args: never[]) => unknown>(klass: T, name: string): T {
  Object.defineProperty(klass, "name", { value: `AbstractControllerTests::Layouts::${name}` });
  return klass;
}

type LayoutOption = Parameters<typeof Layouts.ClassMethods.layout>[0];
type LayoutConditions = Parameters<typeof Layouts.ClassMethods.layout>[1];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
class Base extends AbstractController.AbstractController {
  declare static layout: (layout: LayoutOption, conditions?: LayoutConditions) => void;
  declare static viewPaths: (paths: unknown) => void;
  declare _actionHasLayout: boolean;
  declare _renderedFormat: unknown;

  /**
   * @inlinedFrom ActionView::Layouts#initialize rails/v8.0.2/actionview/lib/action_view/layouts.rb:361-364
   * @inlinedFrom ActionView::Rendering#initialize rails/v8.0.2/actionview/lib/action_view/rendering.rb:32-35
   */
  constructor() {
    super();
    this._actionHasLayout = true;
    this._renderedFormat = null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
interface Base {
  render(...args: unknown[]): unknown;
}
include(Base, AbstractController.Rendering);
include(Base, Rendering);
include(Base, Layouts);
Base.abstractBang();

Base.viewPaths([
  new FixtureResolver({
    "some/template.tse": "hello <%= foo %> bar",
    "layouts/hello.tse": "With String <%= yield %>",
    "layouts/hello_locals.tse": "With String <%= foo %> <%= yield %>",
    "layouts/hello_override.tse": "With Override <%= yield %>",
    "layouts/overwrite.tse": "Overwrite <%= yield %>",
    "layouts/with_false_layout.tse": "False Layout <%= yield %>",
    "abstract-controller-tests/layouts/with-string-implied-child.tse": "With Implied <%= yield %>",
    "abstract-controller-tests/layouts/with-grand-child-of-implied.tse":
      "With Grand Child <%= yield %>",
  }),
]);

class Blank extends Base {
  static {
    this.viewPaths([]);
  }

  index(): unknown {
    return this.render({ template: new Text("Hello blank!") });
  }
}

class WithStringLocals extends Base {
  static {
    this.layout("hello_locals");
  }

  index(): unknown {
    return this.render({ template: "some/template", locals: { foo: "less than 3" } });
  }

  overwriteWithDefault(): unknown {
    return this.render({
      layout: ":default",
      template: "some/template",
      locals: { foo: "less than 3" },
    });
  }
}

class WithString extends Base {
  static {
    this.layout("hello");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello string!") });
  }

  actionHasLayoutFalse(): unknown {
    return this.render({ template: new Text("Hello string!") });
  }

  overwriteDefault(): unknown {
    return this.render({ template: new Text("Hello string!"), layout: ":default" });
  }

  overwriteFalse(): unknown {
    return this.render({ template: new Text("Hello string!"), layout: false });
  }

  overwriteString(): unknown {
    return this.render({ template: new Text("Hello string!"), layout: "overwrite" });
  }

  overwriteSkip(): unknown {
    return this.render({ plain: "Hello text!" });
  }
}

class WithStringChild extends WithString {}

class WithStringOverriddenChild extends WithString {
  static {
    this.layout("hello_override");
  }
}

class WithStringImpliedChild extends WithString {
  static {
    named(this, "WithStringImpliedChild");
    this.layout(null);
  }
}

class WithChildOfImplied extends WithStringImpliedChild {}

class WithGrandChildOfImplied extends WithStringImpliedChild {
  static {
    named(this, "WithGrandChildOfImplied");
    this.layout(null);
  }
}

class WithProc extends Base {
  static {
    this.layout(() => "overwrite");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello proc!") });
  }
}

class WithProcReturningNil extends WithString {
  static {
    this.layout(() => null);
  }

  override index(): unknown {
    return this.render({ template: new Text("Hello nil!") });
  }
}

class WithProcReturningFalse extends WithString {
  static {
    this.layout(() => false);
  }

  override index(): unknown {
    return this.render({ template: new Text("Hello false!") });
  }
}

class WithZeroArityProc extends Base {
  static {
    this.layout(() => "overwrite");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello zero arity proc!") });
  }
}

class WithProcInContextOfInstance extends Base {
  anInstanceMethod(): void {}

  static {
    this.layout(function (this: unknown) {
      if (!rbObjRespondTo(this, "anInstanceMethod")) return;
      return "overwrite";
    });
  }

  index(): unknown {
    return this.render({ template: new Text("Hello again zero arity proc!") });
  }
}

class WithSymbol extends Base {
  static {
    this.layout(":hello");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello symbol!") });
  }

  /** @internal */
  private hello(): string {
    return "overwrite";
  }
}

class WithSymbolReturningNil extends Base {
  static {
    this.layout(":nilz");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello nilz!") });
  }

  nilz(): void {}
}

class WithSymbolReturningObj extends Base {
  static {
    this.layout(":objekt");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello nilz!") });
  }

  objekt(): object {
    return {};
  }
}

class WithSymbolAndNoMethod extends Base {
  static {
    this.layout(":noMethod");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello boom!") });
  }
}

class WithMissingLayout extends Base {
  static {
    this.layout("missing");
  }

  index(): unknown {
    return this.render({ template: new Text("Hello missing!") });
  }
}

class WithFalseLayout extends Base {
  static {
    this.layout(false);
  }

  index(): unknown {
    return this.render({ template: new Text("Hello false!") });
  }
}

class WithNilLayout extends Base {
  static {
    this.layout(null);
  }

  index(): unknown {
    return this.render({ template: new Text("Hello nil!") });
  }
}

class WithOnlyConditional extends WithStringImpliedChild {
  static {
    this.layout("overwrite", { only: "show" });
  }

  override index(): unknown {
    return this.render({ template: new Text("Hello index!") });
  }

  show(): unknown {
    return this.render({ template: new Text("Hello show!") });
  }
}

class WithOnlyConditionalFlipped extends WithOnlyConditional {
  static {
    this.layout("hello_override", { only: "index" });
  }
}

class WithOnlyConditionalFlippedAndInheriting extends WithOnlyConditional {
  static {
    this.layout(null, { only: "index" });
  }
}

class WithExceptConditional extends WithStringImpliedChild {
  static {
    this.layout("overwrite", { except: "show" });
  }

  override index(): unknown {
    return this.render({ template: new Text("Hello index!") });
  }

  show(): unknown {
    return this.render({ template: new Text("Hello show!") });
  }
}

class AbstractWithString extends Base {
  static {
    this.layout("hello");
    this.abstractBang();
  }
}

class AbstractWithStringChild extends AbstractWithString {
  index(): unknown {
    return this.render({ template: new Text("Hello abstract child!") });
  }
}

class AbstractWithStringChildDefaultsToInherited extends AbstractWithString {
  static {
    this.layout(null);
  }

  index(): unknown {
    return this.render({ template: new Text("Hello abstract child!") });
  }
}

class WithConditionalOverride extends WithString {
  static {
    this.layout("overwrite", { only: "overwritten" });
  }

  nonOverwritten(): unknown {
    return this.render({ template: new Text("Hello non overwritten!") });
  }

  overwritten(): unknown {
    return this.render({ template: new Text("Hello overwritten!") });
  }
}

class WithConditionalOverrideFlipped extends WithConditionalOverride {
  static {
    this.layout("hello_override", { only: "nonOverwritten" });
  }
}

class WithConditionalOverrideFlippedAndInheriting extends WithConditionalOverride {
  static {
    this.layout(null, { only: "nonOverwritten" });
  }
}

describe("TestBase", () => {
  const responseBody = async (
    klass: new () => Base,
    action: string,
    controller: Base = new klass(),
  ): Promise<string> => {
    await controller.process(action);
    return String(controller.responseBody);
  };

  test("when no layout is specified, and no default is available, render without a layout", async () => {
    expect(await responseBody(Blank, "index")).toBe("Hello blank!");
  });

  test("when layout is specified as a string, render with locals", async () => {
    expect(await responseBody(WithStringLocals, "index")).toBe(
      "With String less than 3 hello less than 3 bar",
    );
  });

  test("when layout is specified as a string, overwriting with :default, render with locals", async () => {
    expect(await responseBody(WithStringLocals, "overwriteWithDefault")).toBe(
      "With String less than 3 hello less than 3 bar",
    );
  });

  test("when layout is specified as a string, render with that layout", async () => {
    expect(await responseBody(WithString, "index")).toBe("With String Hello string!");
  });

  test("when layout is overwritten by :default in render, render default layout", async () => {
    expect(await responseBody(WithString, "overwriteDefault")).toBe("With String Hello string!");
  });

  test("when layout is overwritten by string in render, render new layout", async () => {
    expect(await responseBody(WithString, "overwriteString")).toBe("Overwrite Hello string!");
  });

  test("when layout is overwritten by false in render, render no layout", async () => {
    expect(await responseBody(WithString, "overwriteFalse")).toBe("Hello string!");
  });

  test("when text is rendered, render no layout", async () => {
    expect(await responseBody(WithString, "overwriteSkip")).toBe("Hello text!");
  });

  test("when layout is specified as a string, but the layout is missing, raise an exception", async () => {
    await expect(new WithMissingLayout().process("index")).rejects.toThrow(MissingTemplate);
  });

  test("when layout is specified as false, do not use a layout", async () => {
    expect(await responseBody(WithFalseLayout, "index")).toBe("Hello false!");
  });

  test("when layout is specified as nil, do not use a layout", async () => {
    expect(await responseBody(WithNilLayout, "index")).toBe("Hello nil!");
  });

  test("when layout is specified as a proc, do not leak any methods into controller's action_methods", () => {
    expect(new Set(WithProc.actionMethods())).toEqual(new Set(["index"]));
  });

  test("when layout is specified as a proc, call it and use the layout returned", async () => {
    expect(await responseBody(WithProc, "index")).toBe("Overwrite Hello proc!");
  });

  test("when layout is specified as a proc and the proc returns nil, use inherited layout", async () => {
    expect(await responseBody(WithProcReturningNil, "index")).toBe("With String Hello nil!");
  });

  test("when layout is specified as a proc and the proc returns false, use no layout instead of inherited layout", async () => {
    expect(await responseBody(WithProcReturningFalse, "index")).toBe("Hello false!");
  });

  test("when layout is specified as a proc without parameters it works just the same", async () => {
    expect(await responseBody(WithZeroArityProc, "index")).toBe("Overwrite Hello zero arity proc!");
  });

  test("when layout is specified as a proc without parameters the block is evaluated in the context of an instance", async () => {
    expect(await responseBody(WithProcInContextOfInstance, "index")).toBe(
      "Overwrite Hello again zero arity proc!",
    );
  });

  test("when layout is specified as a symbol, call the requested method and use the layout returned", async () => {
    expect(await responseBody(WithSymbol, "index")).toBe("Overwrite Hello symbol!");
  });

  test("when layout is specified as a symbol and the method returns nil, don't use a layout", async () => {
    expect(await responseBody(WithSymbolReturningNil, "index")).toBe("Hello nilz!");
  });

  test("when the layout is specified as a symbol and the method doesn't exist, raise an exception", async () => {
    await expect(new WithSymbolAndNoMethod().process("index")).rejects.toThrow(NameError);
  });

  test("when the layout is specified as a symbol and the method returns something besides a string/false/nil, raise an exception", async () => {
    await expect(new WithSymbolReturningObj().process("index")).rejects.toThrow(ArgumentError);
  });

  test("when a child controller does not have a layout, use the parent controller layout", async () => {
    expect(await responseBody(WithStringChild, "index")).toBe("With String Hello string!");
  });

  test("when a child controller has specified a layout, use that layout and not the parent controller layout", async () => {
    expect(await responseBody(WithStringOverriddenChild, "index")).toBe(
      "With Override Hello string!",
    );
  });

  test("when a child controller has an implied layout, use that layout and not the parent controller layout", async () => {
    expect(await responseBody(WithStringImpliedChild, "index")).toBe("With Implied Hello string!");
  });

  test("when a grandchild has no layout specified, the child has an implied layout, and the parent has specified a layout, use the child controller layout", async () => {
    expect(await responseBody(WithChildOfImplied, "index")).toBe("With Implied Hello string!");
  });

  test("when a grandchild has nil layout specified, the child has an implied layout, and the parent has specified a layout, use the grand child controller layout", async () => {
    expect(await responseBody(WithGrandChildOfImplied, "index")).toBe(
      "With Grand Child Hello string!",
    );
  });

  test("a child inherits layout from abstract controller", async () => {
    expect(await responseBody(AbstractWithStringChild, "index")).toBe(
      "With String Hello abstract child!",
    );
  });

  test("a child inherits layout from abstract controller2", async () => {
    expect(await responseBody(AbstractWithStringChildDefaultsToInherited, "index")).toBe(
      "With String Hello abstract child!",
    );
  });

  test("raises an exception when specifying layout true", () => {
    expect(() => {
      class BadFailLayout extends Base {
        static {
          this.layout(true);
        }
      }
      return BadFailLayout;
    }).toThrow(ArgumentError);
  });

  test("when specify an :only option which match current action name", async () => {
    expect(await responseBody(WithOnlyConditional, "show")).toBe("Overwrite Hello show!");
  });

  test("when specify an :only option which does not match current action name", async () => {
    expect(await responseBody(WithOnlyConditional, "index")).toBe("With Implied Hello index!");
  });

  test("when specify an :only option which match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithOnlyConditionalFlipped, "show")).toBe("With Implied Hello show!");
  });

  test("when specify an :only option which does not match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithOnlyConditionalFlipped, "index")).toBe(
      "With Override Hello index!",
    );
  });

  test("when specify to inherit and an :only option which match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithOnlyConditionalFlippedAndInheriting, "show")).toBe(
      "With Implied Hello show!",
    );
  });

  test("when specify to inherit and an :only option which does not match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithOnlyConditionalFlippedAndInheriting, "index")).toBe(
      "Overwrite Hello index!",
    );
  });

  test("when specify an :except option which match current action name", async () => {
    expect(await responseBody(WithExceptConditional, "show")).toBe("With Implied Hello show!");
  });

  test("when specify an :except option which does not match current action name", async () => {
    expect(await responseBody(WithExceptConditional, "index")).toBe("Overwrite Hello index!");
  });

  test("when specify overwrite as an :only option which match current action name", async () => {
    expect(await responseBody(WithConditionalOverride, "overwritten")).toBe(
      "Overwrite Hello overwritten!",
    );
  });

  test("when specify overwrite as an :only option which does not match current action name", async () => {
    expect(await responseBody(WithConditionalOverride, "nonOverwritten")).toBe(
      "Hello non overwritten!",
    );
  });

  test("when specify overwrite as an :only option which match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithConditionalOverrideFlipped, "overwritten")).toBe(
      "Hello overwritten!",
    );
  });

  test("when specify overwrite as an :only option which does not match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithConditionalOverrideFlipped, "nonOverwritten")).toBe(
      "With Override Hello non overwritten!",
    );
  });

  test("when specify to inherit and overwrite as an :only option which match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithConditionalOverrideFlippedAndInheriting, "overwritten")).toBe(
      "Hello overwritten!",
    );
  });

  test("when specify to inherit and overwrite as an :only option which does not match current action name and is opposite from parent controller", async () => {
    expect(await responseBody(WithConditionalOverrideFlippedAndInheriting, "nonOverwritten")).toBe(
      "Overwrite Hello non overwritten!",
    );
  });

  test("layout for anonymous controller", async () => {
    const klass = class extends WithString {
      override index(): unknown {
        return this.render({ plain: "index", layout: true });
      }
    };

    expect(await responseBody(klass, "index")).toBe("With String index");
  });

  test("when layout is disabled with #action_has_layout? returning false, render no layout", async () => {
    const controller = new WithString();
    (controller as unknown as { isActionHasLayout(): boolean }).isActionHasLayout = () => false;
    expect(await responseBody(WithString, "actionHasLayoutFalse", controller)).toBe(
      "Hello string!",
    );
  });
});
