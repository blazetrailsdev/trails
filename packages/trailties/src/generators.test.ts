// Mirrors railties/test/generators_test.rb.
import { describe, it, expect, beforeAll } from "vitest";
import { Generators } from "./generators.js";
import { createProgram } from "./cli.js";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";

beforeAll(async () => {
  await Generators.lookupBang();
});

/** Every directory under `generators/rails` that ships a `*-generator` file. */
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

describe("Rails::Generators", () => {
  it("lookup! finds a generator for every generator directory", async () => {
    const namespaces = (await Generators.publicNamespaces()).sort();
    const expected = (await generatorDirectories()).map((d) => `rails:${d}`).sort();
    expect(namespaces).toEqual(expected);
  });

  it("find_by_namespace finds a generator by its short name", async () => {
    const klass = await Generators.findByNamespace("helper");
    expect(klass?.name).toBe("HelperGenerator");
  });

  it("find_by_namespace finds a nested generator by its full namespace", async () => {
    const klass = await Generators.findByNamespace("change", "rails:db:system");
    expect(klass?.name).toBe("ChangeGenerator");
  });

  it("find_by_namespace returns nothing for an unknown generator", async () => {
    expect(await Generators.findByNamespace("nonexistent")).toBeUndefined();
  });

  it("invoke raises for an unknown generator", async () => {
    await expect(
      Generators.invoke("nonexistent", [], { cwd: "/tmp", output: () => {} }),
    ).rejects.toThrow("Could not find generator 'nonexistent'.");
  });

  it("sorted_groups hides the generators Rails does not advertise", async () => {
    const groups = await Generators.sortedGroups();
    const rails = groups.find(([base]) => base === "rails")![1];
    expect(rails).toContain("helper");
    expect(rails).not.toContain("master_key");
    expect(rails).not.toContain("credentials");
    expect(rails).not.toContain("db:system:change");
  });

  it("print_generators lists the rails group", async () => {
    const lines: string[] = [];
    await Generators.printGenerators((m) => lines.push(m));
    expect(lines).toContain("Rails:");
    expect(lines).toContain("  scaffold_controller");
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
});
