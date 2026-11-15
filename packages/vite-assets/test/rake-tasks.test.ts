import { Application, Rake, Task } from "@blazetrails/rake";
import { Dir, File, stderr } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViteAssets } from "../lib/vite-assets.js";
import { pathToTestApp, refreshConfig } from "./support/test-helper.js";

async function testAppDevDependencies(): Promise<Record<string, string>> {
  return JSON.parse(await File.readAsync(`${pathToTestApp()}/package.json`))["devDependencies"];
}

type WithNodeEnv = { withNodeEnv(env: string, block: () => Promise<unknown>): Promise<unknown> };

async function installedNodeModuleNames(): Promise<string[]> {
  const nodeModulesPath = File.expandPath("node_modules", pathToTestApp());
  return Dir.chdir(nodeModulesPath, () => Dir.globAsync("*"));
}

describe("RakeTasksTest", () => {
  beforeEach(async () => {
    Rake.application = new Application();
    await refreshConfig();
  });
  afterEach(() => {
    Rake.application = undefined;
  });

  async function invoke(name: string): Promise<void> {
    await Dir.chdir(pathToTestApp(), async () => (await Task.get(name)).invoke());
  }

  it("rake tasks", async () => {
    expect(await ViteAssets.installTasks()).toBeTruthy();
    const output = Rake.application!.tasks.map((t) => t.name);

    expect(output).toContain("vite:build");
    expect(output).toContain("vite:build_ssr");
    expect(output).toContain("vite:clobber");
    expect(output).toContain("vite:install_dependencies");
    expect(output).toContain("vite:verify_install");
  });

  it("rake task vite check binstubs", async () => {
    await ViteAssets.installTasks();
    const write = vi.spyOn(stderr, "write");
    try {
      await invoke("vite:verify_install");
      const output = write.mock.calls.map(([s]) => String(s)).join("");

      expect(output).not.toContain("vite binstub not found.");
    } finally {
      write.mockRestore();
    }
  });

  it("rake vite install dependencies in non production environments", async () => {
    await ViteAssets.installTasks();
    expect(Object.keys(await testAppDevDependencies())).toContain("right-pad");

    await (ViteAssets.commands() as unknown as WithNodeEnv).withNodeEnv("test", () =>
      invoke("vite:install_dependencies"),
    );

    expect(await installedNodeModuleNames(), "Expected dev dependencies to be installed").toContain(
      "right-pad",
    );
  }, 300_000);

  it("rake vite install dependencies in production environment", async () => {
    await ViteAssets.installTasks();
    await (ViteAssets.commands() as unknown as WithNodeEnv).withNodeEnv("production", () =>
      invoke("vite:install_dependencies"),
    );

    expect(
      await installedNodeModuleNames(),
      "Expected development dependencies to be installed as well",
    ).toContain("right-pad");
  }, 300_000);
});
