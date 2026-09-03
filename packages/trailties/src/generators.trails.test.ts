// Trails-only: `Rails::Generators.lookup!` globs the Ruby load path and Thor's
// `inherited` hook files the subclasses; the ESM port walks the generator tree
// itself, so these cover the walk and the Commander subcommands built from it.
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
import { Generators } from "./generators.js";
import { createProgram } from "./cli.js";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";

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

  it("find by namespace reaches a generator nested under db:system", async () => {
    const klass = await Generators.findByNamespace("change", "rails:db:system");
    expect(klass?.namespace).toEqual("rails:db:system:change");
  });

  it("invoke runs the generator it found", async () => {
    const tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "trails-generators-"));
    fs.writeFileSync(nodePath.join(tmpDir, "tsconfig.json"), "{}");
    try {
      const created = await Generators.invoke("rails:helper", ["Account"], {
        cwd: tmpDir,
        output: () => {},
      });
      expect(created).toContain("app/helpers/account-helper.ts");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("every generator directory is reachable as a trails generate subcommand", async () => {
    const generate = createProgram().commands.find((c) => c.name() === "generate")!;
    const subNames = generate.commands.map((c) => c.name());
    for (const dir of await generatorDirectories()) {
      expect(subNames).toContain(dir);
    }
  });

  it("a namespace Rails hides is registered but not advertised", async () => {
    const generate = createProgram().commands.find((c) => c.name() === "generate")!;
    const help = generate.helpInformation();
    for (const name of ["devcontainer", "resource_route", "master_key"]) {
      expect(generate.commands.map((c) => c.name())).toContain(name);
      expect(help).not.toMatch(new RegExp(`^\\s+${name}\\b`, "m"));
    }
    expect(help).toMatch(/^\s+helper\b/m);
  });
});
