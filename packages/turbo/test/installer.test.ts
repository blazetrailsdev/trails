import { Application, Rake, Task } from "@blazetrails/rake";
import { File, FileUtils, Pathname, STDOUT } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const system = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    rbFSystem: async (...args: unknown[]) => system(...args),
  };
});

describe("InstallerTest", () => {
  let rootDir: Pathname;

  beforeAll(async () => {
    Rake.application = new Application();
    await import("../lib/tasks/turbo-tasks.js");
  });

  afterAll(() => {
    Rake.application = undefined;
  });

  async function withNewTrailsApp(options: string[], block: () => Promise<void>): Promise<void> {
    await FileUtils.mkdirPAsync(rootDir.join("app/javascript/entrypoints").toString());
    if (!options.includes("--skip-javascript")) {
      await File.writeAsync(rootDir.join("package.json").toString(), "{}");
      await File.writeAsync(
        rootDir.join("app/javascript/entrypoints/application.js").toString(),
        "",
      );
    }
    if (options.includes("--javascript=bun")) {
      await File.writeAsync(rootDir.join("bun.config.js").toString(), "");
    }
    await block();
  }

  async function runCommand(...command: string[]): Promise<[string]> {
    const puts = vi.spyOn(STDOUT, "puts");
    try {
      await (await Task.get(command.at(-1)!)).invoke();
      return [puts.mock.calls.map((args) => args.join("\n")).join("\n")];
    } finally {
      puts.mockRestore();
    }
  }

  function read(path: string): Promise<string> {
    return File.readAsync(rootDir.join(path).toString());
  }

  beforeEach(async () => {
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    vi.spyOn(Trails, "root").mockReturnValue(new Pathname(rootDir.toString()));
    system.mockImplementation(async (...args: unknown[]) => {
      if (args.includes("app:template")) {
        const location = String(args.at(-1)).replace(/^LOCATION=/, "");
        const { AppGenerator } = await import("@blazetrails/trailties/generators");
        await AppGenerator.applyTrailsTemplate(location, rootDir.toString());
      }
      const [, manager, pkg] = /^(pnpm|bun) add (\S+)$/.exec(String(args[0])) ?? [];
      if (pkg) {
        const packageJson = JSON.parse(await read("package.json"));
        packageJson.dependencies = { ...packageJson.dependencies, [pkg]: "*" };
        await File.writeAsync(rootDir.join("package.json").toString(), JSON.stringify(packageJson));
        if (manager === "pnpm") {
          await File.writeAsync(rootDir.join("pnpm-lock.yaml").toString(), `  ${pkg}:\n`);
        }
      }
      return true;
    });
  });

  afterEach(async () => {
    for (const name of ["turbo:install", "turbo:install:node", "turbo:install:bun"]) {
      (await Task.get(name)).reenable();
    }
    vi.restoreAllMocks();
    await FileUtils.rmRfAsync(rootDir.toString());
  });

  it("installer", { timeout: 60_000 }, async () => {
    await withNewTrailsApp([], async () => {
      await runCommand("bin/trails", "turbo:install");

      expect(await read("app/javascript/entrypoints/application.js")).toMatch(
        `import "@hotwired/turbo-rails"\n`,
      );
      expect(await read("package.json")).toMatch("@hotwired/turbo-rails");
      expect(await read("pnpm-lock.yaml")).toMatch("@hotwired/turbo-rails");
    });
  });

  it("installer with no javascript", async () => {
    await withNewTrailsApp(["--skip-javascript"], async () => {
      const [out] = await runCommand("bin/trails", "turbo:install");

      expect(out).toMatch(
        "You must either be running with node (package.json) or importmap-rails (config/importmap.rb) to use this gem.",
      );
    });
  });

  it("installer with pre-existing application.js", { timeout: 60_000 }, async () => {
    await withNewTrailsApp([], async () => {
      await File.writeAsync(
        rootDir.join("app/javascript/entrypoints/application.js").toString(),
        "// pre-existing",
      );
      await runCommand("bin/trails", "turbo:install");

      expect(await read("app/javascript/entrypoints/application.js")).toMatch("// pre-existing");
      expect(await read("app/javascript/entrypoints/application.js")).toMatch(
        `import "@hotwired/turbo-rails"\n`,
      );
    });
  });

  it("installer with bun", { timeout: 60_000 }, async () => {
    await withNewTrailsApp(["--javascript=bun"], async () => {
      await runCommand("bin/trails", "turbo:install");

      expect(await read("app/javascript/entrypoints/application.js")).toMatch(
        `import "@hotwired/turbo-rails"\n`,
      );
      expect(await read("package.json")).toMatch("@hotwired/turbo-rails");
    });
  });
});
