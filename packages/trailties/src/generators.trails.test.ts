import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
import { Generators } from "./generators.js";
import { DATABASES } from "./generators/database.js";
import { createProgram } from "./cli.js";
import { AuthenticationGenerator } from "./generators/rails/authentication/authentication-generator.js";
import { GeneratorGenerator } from "./generators/rails/generator/generator-generator.js";
import { getFs, getPath } from "@blazetrails/ruby-compat";

beforeAll(async () => {
  await Generators.lookupBang();
});

async function generatorDirectories(): Promise<string[]> {
  const fs = getFs();
  const path = getPath();
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

  it("trails generate passes declared class options through to the generator", async () => {
    const seen: unknown[] = [];
    const auth = vi.spyOn(AuthenticationGenerator.prototype, "run").mockImplementation(function (
      this: AuthenticationGenerator,
    ) {
      seen.push(this.options.api);
      return [];
    });
    const gen = vi.spyOn(GeneratorGenerator.prototype, "run").mockImplementation(function (
      this: GeneratorGenerator,
    ) {
      seen.push(this.options.namespace);
      return [];
    });
    try {
      await createProgram().parseAsync(["generate", "authentication", "--api"], { from: "user" });
      await createProgram().parseAsync(["generate", "generator", "foo", "--no-namespace"], {
        from: "user",
      });
    } finally {
      auth.mockRestore();
      gen.mockRestore();
    }
    expect(seen).toEqual([true, false]);
  });

  it("a lookup-registered subcommand advertises its generator's class options", () => {
    const generate = createProgram().commands.find((c) => c.name() === "generate")!;
    const sub = generate.commands.find((c) => c.name() === "generator")!;
    let help = "";
    sub.configureOutput({ writeOut: (str) => (help += str) });
    sub.outputHelp();
    expect(help).toMatch(
      /\[--namespace\], \[--no-namespace\], \[--skip-namespace\]\s+# Namespace generator/,
    );
    expect(help).toMatch(/\[--skip-collision-check\]/);
  });

  it("find by namespace imports only the candidate generator files", async () => {
    vi.resetModules();
    const { Generators: fresh } = await import("./generators.js");
    await fresh.findByNamespace("rails:helper");
    expect(fresh.subclasses().map((k) => k.namespace)).toEqual(["rails:helper"]);
  });

  it("an enum class option rejects an undeclared value with Thor's message", async () => {
    const devcontainer = (await Generators.findByNamespace("devcontainer"))!;
    await expect(
      devcontainer.start(["--database", "oracle"], { cwd: "/tmp", output: () => {} }),
    ).rejects.toThrow(`Expected '--database' to be one of ${DATABASES.join(", ")}; got "oracle"`);
  });
});
