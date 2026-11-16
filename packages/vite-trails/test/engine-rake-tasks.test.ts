import { Application, Rake, Task } from "@blazetrails/rake";
import {
  Dir,
  File,
  FileUtils as RbFileUtils,
  Pathname,
  rbFLoad,
  setEnv,
} from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exec,
}));
import { Commands } from "@blazetrails/vite-assets/commands.js";
import "../lib/cli.js";

const { CLI } = ViteAssets;

const LAYOUT = `<!DOCTYPE html>
<html>
  <head>
    <title>Vite ⚡️ Ruby</title>
  </head>

  <body>
    <%= yield %>
  </body>
</html>
`;

const CSP = `export default {
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "https:"],
};
`;

describe("EngineRakeTasksTest", () => {
  let rootDir: Pathname;

  function viteConfigTsPath(): Pathname {
    return rootDir.join("vite.config.ts");
  }

  function procfileDev(): Pathname {
    return rootDir.join("Procfile.dev");
  }

  function appFrontendDir(): Pathname {
    return rootDir.join("app/frontend");
  }

  async function assertPathExists(path: Pathname): Promise<void> {
    expect(await File.isExistAsync(path.toString())).toBe(true);
  }

  function withinMountedAppRoot<T>(block: () => Promise<T>): Promise<T> {
    return Dir.chdir(rootDir.toString(), block);
  }

  async function install(): Promise<void> {
    const spy = vi
      .spyOn(
        CLI.Install.prototype as unknown as { installJsPackages(): unknown },
        "installJsPackages",
      )
      .mockResolvedValue(undefined);
    try {
      await withinMountedAppRoot(async () => {
        ViteAssets.reloadWith({ root: rootDir.toString() });
        await new CLI.Install().call();
      });
    } finally {
      spy.mockRestore();
    }
  }

  function stubBuildFromTask(): ReturnType<typeof vi.fn> {
    const mock = vi.fn().mockResolvedValue(true);
    vi.spyOn(Commands.prototype, "buildFromTask").mockImplementation(mock);
    return mock;
  }

  async function installTasks(): Promise<void> {
    await rbFLoad(decodeURIComponent(new URL("../lib/tasks/vite.js", import.meta.url).pathname));
  }

  beforeEach(async () => {
    rootDir = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
    await RbFileUtils.mkdirPAsync(rootDir.join("app/views/layouts").toString());
    await RbFileUtils.mkdirPAsync(rootDir.join("config/initializers").toString());
    await File.writeAsync(
      rootDir.join("app/views/layouts/application.html.tse").toString(),
      LAYOUT,
    );
    await File.writeAsync(
      rootDir.join("config/initializers/content-security-policy.ts").toString(),
      CSP,
    );
    await File.writeAsync(rootDir.join(".gitignore").toString(), "");
    Rake.application = new Application();
    setEnv("VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL", "true");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setEnv("VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL", undefined);
    Rake.application = undefined;
    await RbFileUtils.rmRfAsync(rootDir.toString());
  });

  it("tasks mounted", async () => {
    await installTasks();
    const output = Rake.application!.tasks.map((t) => t.name);

    expect(output).toContain("vite:build_all");
    expect(output).toContain("assets:precompile");
  });

  it("rake tasks", { timeout: 60_000 }, async () => {
    await install();

    await assertPathExists(viteConfigTsPath());
    await assertPathExists(procfileDev());
    await assertPathExists(appFrontendDir());

    const buildFromTask = stubBuildFromTask();
    await withinMountedAppRoot(async () => {
      await ViteAssets.reloadWith({ root: rootDir.toString() }).config();
      await installTasks();
      await (await Task.get("assets:precompile")).invoke();
    });

    expect(buildFromTask).toHaveBeenCalledWith();
  });

  it("cli", { timeout: 60_000 }, async () => {
    await install();

    await assertPathExists(viteConfigTsPath());
    await assertPathExists(procfileDev());
    await assertPathExists(appFrontendDir());
    expect(await procfileDev().read()).toContain("web: bin/trails s");
    expect(await rootDir.join("config/vite.json").read()).toContain('"port": 3036');
    expect(await rootDir.join("app/views/layouts/application.html.tse").read()).toContain(
      "<%= await viteClientTag() %>\n",
    );
    expect(await rootDir.join("config/initializers/content-security-policy.ts").read()).toContain(
      "// Allow @vite/client to hot reload javascript changes in development",
    );

    const buildFromTask = stubBuildFromTask();
    await withinMountedAppRoot(async () => {
      expect(await new CLI.Build().call({ mode: "development" })).toBeTruthy();
    });
    expect(buildFromTask).toHaveBeenCalledOnce();
  });

  it("cli commands", { timeout: 60_000 }, async () => {
    await File.writeAsync(
      rootDir.join("config/vite.json").toString(),
      JSON.stringify({ all: { sourceCodeDir: "app/frontend", ssrBuildEnabled: true } }),
    );
    await withinMountedAppRoot(async () => {
      ViteAssets.reloadWith({ root: Dir.pwd() });
      await ViteAssets.commands().verifyInstall();

      ViteAssets.reloadWith({ root: Dir.pwd() });

      const installJsPackages = vi
        .spyOn(
          CLI.Install.prototype as unknown as { installJsPackages(): unknown },
          "installJsPackages",
        )
        .mockResolvedValue(undefined);
      await new CLI.Install().call();
      await ViteAssets.commands().verifyInstall();
      await new CLI.Version().call();
      const runWithCapture = vi
        .spyOn(CLI.Install.prototype as unknown as { runWithCapture(): unknown }, "runWithCapture")
        .mockResolvedValue(undefined);
      await new CLI.Upgrade().call();
      expect(runWithCapture).toHaveBeenCalledOnce();
      expect(exec).toHaveBeenLastCalledWith("bundle exec vite upgrade_packages");
      await new CLI.UpgradePackages().call();
      expect(installJsPackages).toHaveBeenCalledTimes(2);

      const { mode, ssrOutputDir } = await ViteAssets.config();
      const run = vi
        .spyOn(ViteAssets.instance(), "run")
        .mockResolvedValue(["stdout", "stderr", { isSuccess: () => true }]);
      expect(await new CLI.Build().call({ mode })).toBeTruthy();
      expect(run).toHaveBeenLastCalledWith(["build"]);
      expect(await new CLI.Build().call({ mode, ssr: true })).toBeTruthy();
      expect(run).toHaveBeenLastCalledWith(["build", "--ssr"]);

      await RbFileUtils.mkdirPAsync(ssrOutputDir.toString());
      const ssrPath = ssrOutputDir.join("ssr.js");
      await File.writeAsync(ssrPath.toString(), "");
      await new CLI.SSR().call({ mode });
      expect(exec).toHaveBeenLastCalledWith("node", ssrPath.toString());

      expect(await new CLI.Dev().call({ mode, args: ["--wat"] })).toBeTruthy();
      expect(run).toHaveBeenLastCalledWith(["--wat"], { exec: true });

      await new CLI.Clobber().call({ mode });
    });
  });
});
