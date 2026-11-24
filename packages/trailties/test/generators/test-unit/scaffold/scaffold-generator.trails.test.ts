import { afterEach, describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { setEngineRoot } from "../../../../lib/app-path.js";
import { Generators } from "../../../../lib/generators.js";
import { ScaffoldGenerator } from "../../../../lib/generators/test-unit/scaffold/scaffold-generator.js";

const previous = Generators.namespace;

async function generate(...args: string[]): Promise<string> {
  const root = Dir.mktmpdir();
  File.write(File.join(root, "tsconfig.json"), "{}");
  await ScaffoldGenerator.start(args, { destinationRoot: root });
  return root;
}

describe("TestUnit::Generators::ScaffoldGenerator", () => {
  afterEach(() => {
    setEngineRoot(undefined);
    Generators.namespace = previous;
  });

  it("names the fixture after the engine namespace and includes the engine's url helpers inside a mountable engine", async () => {
    Generators.namespace = { name: "Bukkits" };
    setEngineRoot(Dir.mktmpdir());
    const out = await generate("product_line");
    const test = File.read(
      File.join(out, "test/controllers/bukkits/product-lines-controller.test.ts"),
    );
    expect(test).toContain('import { Bukkits } from "../../../lib/bukkits/engine.js";');
    expect(test).toContain(
      'import { ProductLine } from "../../../app/models/bukkits/product-line.js";',
    );
    expect(test).toContain(
      'constSet(constGet(Object, "Bukkits") as object, "ProductLinesControllerTest", this);',
    );
    expect(test).toContain("include(this, Bukkits.Engine.routes().urlHelpers());");
    expect(test).toContain('await this.bukkits_product_lines("one")');
    expect(test).toContain('describe("Bukkits::ProductLinesControllerTest"');
  });

  it("names the fixture after the table outside an engine", async () => {
    const out = await generate("product_line");
    const test = File.read(File.join(out, "test/controllers/product-lines-controller.test.ts"));
    expect(test).toContain('await this.product_lines("one")');
    expect(test).not.toContain("urlHelpers");
  });
});
