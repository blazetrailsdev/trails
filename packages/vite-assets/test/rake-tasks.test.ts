import { Application, Rake, Task } from "@blazetrails/rake";
import {
  childProcessAdapterConfig,
  Dir,
  File,
  getChildProcess,
  registerChildProcessAdapter,
  stderr,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViteAssets } from "../lib/vite-assets.js";
import { pathToTestApp, refreshConfig } from "./support/test-helper.js";

async function testAppDevDependencies(): Promise<Record<string, string>> {
  return JSON.parse(await File.readAsync(`${pathToTestApp()}/package.json`))["devDependencies"];
}

type WithNodeEnv = { withNodeEnv(env: string, block: () => Promise<unknown>): Promise<unknown> };

async function installDependencies(nodeEnv: string): Promise<[string, Record<string, unknown>]> {
  const calls: [string, Record<string, unknown>][] = [];
  registerChildProcessAdapter("rake-tasks-test", {
    spawnSync: getChildProcess().spawnSync,
    system: async (command, env, args) => {
      calls.push([[command, ...(args ?? [])].join(" "), env]);
      return { pid: 1, status: 0, signal: null };
    },
  });
  childProcessAdapterConfig.adapter = "rake-tasks-test";
  try {
    await (ViteAssets.commands() as unknown as WithNodeEnv).withNodeEnv(nodeEnv, () =>
      Dir.chdir(pathToTestApp(), async () =>
        (await Task.get("vite:install_dependencies")).invoke(),
      ),
    );
  } finally {
    childProcessAdapterConfig.adapter = null;
  }
  return calls[0];
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

    const [command, env] = await installDependencies("test");

    expect([command, env["NODE_ENV"]]).toEqual(["yarn install --frozen-lockfile", "development"]);
  });

  it("rake vite install dependencies in production environment", async () => {
    await ViteAssets.installTasks();
    const [command, env] = await installDependencies("production");

    expect([command, env["NODE_ENV"]]).toEqual(["yarn install --frozen-lockfile", "development"]);
  });
});
