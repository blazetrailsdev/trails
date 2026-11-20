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
    const root = Dir.mktmpdir();
    setEngineRoot(root);
    const out = await generate("post");
    const test = File.read(File.join(out, "test/controllers/bukkits/posts-controller.test.ts"));
    expect(test).toContain('await this.bukkitsPosts("one")');
    expect(test).toContain(
      'include(this, (constGet(Object, "Bukkits::Engine") as Engine).routes().urlHelpers());',
    );
  });

  it("names the fixture after the table outside an engine", async () => {
    const out = await generate("post");
    const test = File.read(File.join(out, "test/controllers/posts-controller.test.ts"));
    expect(test).toContain('await this.posts("one")');
    expect(test).not.toContain("urlHelpers");
  });
});
