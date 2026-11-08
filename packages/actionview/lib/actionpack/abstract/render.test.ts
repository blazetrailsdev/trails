import { beforeEach, describe, expect, test } from "vitest";
import { include } from "@blazetrails/activesupport";
import { AbstractController } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";
import { Rendering } from "../../rendering.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
class ControllerRenderer extends AbstractController.Base {
  _prefixes(): string[] {
    return ["renderer"];
  }

  template(): unknown {
    return this.render({ template: "template" });
  }

  inline(): unknown {
    return this.render({ inline: "With <%= 'Inline' %>" });
  }

  text(): unknown {
    return this.render({ plain: "With Text" });
  }

  default(): unknown {
    return this.render();
  }

  string(): unknown {
    return this.render("string");
  }

  stringWithPath(): unknown {
    return this.render("string/with_path");
  }

  symbol(): unknown {
    return this.render("symbol");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include AbstractController::Rendering`; the class/interface merge is how a mixin surfaces on the type side.
interface ControllerRenderer {
  render(...args: unknown[]): unknown;
}
include(ControllerRenderer, AbstractController.Rendering);
include(ControllerRenderer, Rendering);

(ControllerRenderer as unknown as { viewPaths(paths: unknown): void }).viewPaths([
  new FixtureResolver({
    "template.tse": "With Template",
    "renderer/default.tse": "With Default",
    "renderer/string.tse": "With String",
    "renderer/symbol.tse": "With Symbol",
    "string/with_path.tse": "With String With Path",
  }),
]);

describe("TestRenderer", () => {
  let controller: ControllerRenderer;

  beforeEach(() => {
    controller = new ControllerRenderer();
  });

  test("render template", async () => {
    expect(String(await controller.process("template"))).toBe("With Template");
    expect(String(controller.responseBody)).toBe("With Template");
  });

  test("render inline", async () => {
    expect(String(await controller.process("inline"))).toBe("With Inline");
    expect(String(controller.responseBody)).toBe("With Inline");
  });

  test("render text", async () => {
    expect(String(await controller.process("text"))).toBe("With Text");
    expect(String(controller.responseBody)).toBe("With Text");
  });

  test("render default", async () => {
    expect(String(await controller.process("default"))).toBe("With Default");
    expect(String(controller.responseBody)).toBe("With Default");
  });

  test("render string", async () => {
    expect(String(await controller.process("string"))).toBe("With String");
    expect(String(controller.responseBody)).toBe("With String");
  });

  test("render symbol", async () => {
    expect(String(await controller.process("symbol"))).toBe("With Symbol");
    expect(String(controller.responseBody)).toBe("With Symbol");
  });

  test("render string with path", async () => {
    expect(String(await controller.process("stringWithPath"))).toBe("With String With Path");
    expect(String(controller.responseBody)).toBe("With String With Path");
  });
});
