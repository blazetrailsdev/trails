import { Application, Rake, Task } from "@blazetrails/rake";
import { Dir, File, FileUtils, Pathname } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { ViteAssets } from "@blazetrails/vite-assets";
import { CLI } from "@blazetrails/vite-assets/cli.js";
import "../lib/cli.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const system = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    rbFSystem: async (...args: unknown[]) => system(...args),
  };
});

describe("stimulus:install", () => {
  let rootDir: Pathname;

  beforeEach(async () => {
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    await FileUtils.mkdirPAsync(rootDir.join("app/javascript").toString());
    await File.writeAsync(
      rootDir.join("package.json").toString(),
      JSON.stringify({ private: true, type: "module" }),
    );
    await File.writeAsync(rootDir.join("tsconfig.json").toString(), "{}");
    vi.spyOn(Trails, "root").mockReturnValue(rootDir.toString());
    vi.spyOn(
      CLI.Install.prototype as unknown as { installJsPackages(): unknown },
      "installJsPackages",
    ).mockResolvedValue(undefined);
    system.mockImplementation(async (...args: unknown[]) => {
      if (args.includes("app:template")) {
        const location = String(args.at(-1)).replace(/^LOCATION=/, "");
        const { AppGenerator } = await import("@blazetrails/trailties/generators");
        await AppGenerator.applyTrailsTemplate(location, rootDir.toString());
      }
      return true;
    });
    Rake.application = new Application();
    await import("@blazetrails/stimulus/tasks/stimulus-tasks.js");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    Rake.application = undefined;
    await FileUtils.rmRfAsync(rootDir.toString());
  });

  it("installs the node arm into a vite:install app", { timeout: 60_000 }, async () => {
    await Dir.chdir(rootDir.toString(), async () => {
      ViteAssets.reloadWith({ root: rootDir.toString(), mode: "development" });
      await new CLI.Install().call();
      await (await Task.get("stimulus:install")).invoke();
    });

    const entrypoint = await File.readAsync(
      rootDir.join("app/javascript/entrypoints/application.js").toString(),
    );
    expect(entrypoint).toContain(`import "~/controllers"\n`);
    expect(
      await File.isExistAsync(rootDir.join("app/javascript/controllers/index.js").toString()),
    ).toBe(true);
    expect(
      await File.isExistAsync(
        rootDir.join("app/javascript/controllers/hello_controller.js").toString(),
      ),
    ).toBe(true);
    expect(system).toHaveBeenCalledWith("pnpm add @hotwired/stimulus");
  });
});
