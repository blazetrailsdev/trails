// Trails-only: `Rails::Generators.lookup!` globs the Ruby load path and Thor's
// `inherited` hook files the subclasses; the ESM port walks the generator tree
// itself, so these cover the walk and the commander subcommands built from it.
import { describe, it, expect, beforeAll } from "vitest";
import { Generators } from "./generators.js";
import { createProgram } from "./cli.js";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";

beforeAll(async () => {
  await Generators.lookupBang();
});

async function generatorDirectories(): Promise<string[]> {
  const fs = await getFsAsync();
  const path = await getPathAsync();
  const root = decodeURIComponent(new URL("./generators/rails/", import.meta.url).pathname);
  const out: string[] = [];
  const walk = async (dir: string, namespace: string[]): Promise<void> => {
    const entries = (await fs.readdir!(dir)).sort();
    const isDir = (e: string): boolean => fs.statSync(path.join(dir, e)).isDirectory();
    const isGenerator = (e: string): boolean => /-generator\.ts$/.test(e);
    const files = entries.filter((e) => !isDir(e));
    out.push(...files.filter(isGenerator).map(() => namespace.join(":")));
    for (const entry of entries.filter(isDir)) {
      await walk(path.join(dir, entry), [...namespace, entry.replace(/-/g, "_")]);
    }
  };
  await walk(root, []);
  return out;
}

describe("GeneratorsTest", () => {
  it("lookup finds a generator for every generator directory", async () => {
    const namespaces = (await Generators.publicNamespaces()).sort();
    const expected = (await generatorDirectories()).map((d) => `rails:${d}`).sort();
    expect(namespaces).toEqual(expected);
  });

  it("every generator directory is reachable as a trails generate subcommand", async () => {
    const generate = createProgram().commands.find((c) => c.name() === "generate")!;
    const subNames = generate.commands.map((c) => c.name());
    for (const dir of await generatorDirectories()) {
      expect(subNames).toContain(dir);
    }
  });
});
