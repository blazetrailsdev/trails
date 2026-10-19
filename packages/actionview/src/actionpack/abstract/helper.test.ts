import { beforeEach, describe, expect, test } from "vitest";
import { assertRaises, include } from "@blazetrails/activesupport";
import { Module, NameError } from "@blazetrails/ruby-compat";
import { AbstractController } from "@blazetrails/actionpack";
import { Rendering } from "../../rendering.js";
import "../../test-helpers/fixtures/helpers/abc-helper.js";
import "../../test-helpers/fixtures/helpers/helpery-test-helper.js";

interface HelpersStatics {
  helper(...args: unknown[]): void;
  clearHelpers(): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
class ControllerWithHelpers extends AbstractController.AbstractController {
  withModule(): unknown {
    return this.render({ inline: "Module <%= includedMethod() %>" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
interface ControllerWithHelpers {
  render(...args: unknown[]): unknown;
}
include(ControllerWithHelpers, AbstractController.Helpers);
include(ControllerWithHelpers, AbstractController.Rendering);
include(ControllerWithHelpers, Rendering);

const HelperyTest = new Module().include({
  includedMethod(): string {
    return "Included";
  },
});

class AbstractHelpers extends ControllerWithHelpers {
  withBlock(): unknown {
    return this.render({ inline: "Hello <%= helperyTest() %>" });
  }

  withSymbol(): unknown {
    return this.render({ inline: 'I respond to bare_a: <%= "bareA" in this %>' });
  }
}
(AbstractHelpers as unknown as HelpersStatics).helper(
  HelperyTest,
  (mod: Record<string, unknown>) => {
    mod.helperyTest = () => "World";
  },
);
(AbstractHelpers as unknown as HelpersStatics).helper("abc");

class HelperyTestController extends AbstractHelpers {}
(HelperyTestController as unknown as HelpersStatics).clearHelpers();

class AbstractHelpersBlock extends ControllerWithHelpers {}
(AbstractHelpersBlock as unknown as HelpersStatics).helper(function (this: object) {
  include(this, HelperyTest);
});

describe("TestHelpers", () => {
  let controller: ControllerWithHelpers;

  beforeEach(() => {
    controller = new AbstractHelpers();
  });

  test("helpers with block", async () => {
    await controller.process("withBlock");
    expect(String(controller.responseBody)).toBe("Hello World");
  });

  test("helpers with module", async () => {
    await controller.process("withModule");
    expect(String(controller.responseBody)).toBe("Module Included");
  });

  test("helpers with symbol", async () => {
    await controller.process("withSymbol");
    expect(String(controller.responseBody)).toBe("I respond to bare_a: true");
  });

  test("declare missing helper", async () => {
    const e = await assertRaises([NameError], {}, () =>
      (AbstractHelpers as unknown as HelpersStatics).helper("missing"),
    );
    expect(e.message).toContain("uninitialized constant MissingHelper");
  });

  test("helpers with module through block", async () => {
    controller = new AbstractHelpersBlock();
    await controller.process("withModule");
    expect(String(controller.responseBody)).toBe("Module Included");
  });
});

describe("ClearHelpersTest", () => {
  let controller: ControllerWithHelpers;

  beforeEach(() => {
    controller = new HelperyTestController();
  });

  test("clears up previous helpers", async () => {
    await controller.process("withSymbol");
    expect(String(controller.responseBody)).toBe("I respond to bare_a: false");
  });

  test("includes controller default helper", async () => {
    await controller.process("withBlock");
    expect(String(controller.responseBody)).toBe("Hello Default");
  });
});

describe("InvalidHelpersTest", () => {
  test("controller raise error about missing helper", async () => {
    const e = await assertRaises([NameError], {}, () =>
      (AbstractHelpers as unknown as HelpersStatics).helper("missing"),
    );
    expect(e.message).toContain("uninitialized constant MissingHelper");
  });
});
