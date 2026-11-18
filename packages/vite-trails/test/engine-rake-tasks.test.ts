import { Application, DSL, Rake, Task } from "@blazetrails/rake";
import {
  Dir,
  File,
  FileUtils as RbFileUtils,
  Pathname,
  rbFLoad,
  STDOUT,
} from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViteTrails } from "../lib/index.js";
import "../lib/cli.js";

const exec = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exec,
}));

const { CLI } = ViteAssets;

const VITE_BIN_PATH = decodeURIComponent(
  new URL("../node_modules/.bin/vite", import.meta.url).pathname,
);

const VITE_JSON = {
  all: {
    sourceCodeDir: "app/frontend",
    ssrBuildEnabled: true,
    watchAdditionalPaths: [],
    viteBinPath: VITE_BIN_PATH,
  },
  development: { autoBuild: true, publicOutputDir: "vite-dev", port: 3036 },
  test: { autoBuild: true, publicOutputDir: "vite-test", port: 3037 },
};

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

const SSR_ENTRYPOINT = `import http from 'http'

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('Hello, World!!!')
})

server.listen(8080)
`;

describe("EngineRakeTasksTest", () => {
  let rootDir: Pathname;

  function viteBinstubPath(): Pathname {
    return rootDir.join("bin/vite");
  }

  function viteConfigTsPath(): Pathname {
    return rootDir.join("vite.config.ts");
  }

  function procfileDev(): Pathname {
    return rootDir.join("Procfile.dev");
  }

  function appFrontendDir(): Pathname {
    return rootDir.join("app/frontend");
  }

  function appPublicDir(): Pathname {
    return rootDir.join("public/vite-dev");
  }

  function appSsrDir(): Pathname {
    return rootDir.join("public/vite-ssr");
  }

  async function assertPathExists(path: Pathname): Promise<void> {
    expect(await File.isExistAsync(path.toString())).toBe(true);
  }

  async function refutePathExists(path: Pathname): Promise<void> {
    expect(await File.isExistAsync(path.toString())).toBe(false);
  }

  async function withinMountedAppRoot<T>(block: () => Promise<T>): Promise<T> {
    return Dir.chdir(rootDir.toString(), async () => {
      ViteAssets.reloadWith({ root: rootDir.toString(), mode: "development" });
      return block();
    });
  }

  async function withinMountedApp(task: string): Promise<void> {
    await withinMountedAppRoot(async () => (await Task.get(task)).invoke());
  }

  async function installTasks(): Promise<void> {
    await DSL.namespace("app", async () => {
      DSL.task("environment");
      await rbFLoad(
        decodeURIComponent(new URL("../lib/tasks/vite.rake.js", import.meta.url).pathname),
      );
    });
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
    await File.writeAsync(rootDir.join("config/vite.json").toString(), JSON.stringify(VITE_JSON));
    await File.writeAsync(
      rootDir.join("package.json").toString(),
      JSON.stringify({ private: true, type: "module" }),
    );
    await File.writeAsync(rootDir.join(".gitignore").toString(), "");
    vi.spyOn(
      CLI.Install.prototype as unknown as { installJsPackages(): unknown },
      "installJsPackages",
    ).mockResolvedValue(undefined);
    Rake.application = new Application();
    await installTasks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    Rake.application = undefined;
    await RbFileUtils.rmRfAsync(rootDir.toString());
  });

  it("tasks mounted", async () => {
    const output = Rake.application!.tasks.map((t) => t.name).join("\n");

    expect(output).toContain("app:vite");
  });

  it("rake tasks", { timeout: 120_000 }, async () => {
    await withinMountedApp("app:vite:binstubs");

    await assertPathExists(viteBinstubPath());

    await withinMountedAppRoot(() => new CLI.Install().call());

    await assertPathExists(viteConfigTsPath());
    await assertPathExists(procfileDev());
    await assertPathExists(appFrontendDir());

    await withinMountedApp("app:vite:build");

    await assertPathExists(appPublicDir());
    await assertPathExists(appPublicDir().join(".vite/manifest.json"));
    await assertPathExists(appPublicDir().join("assets"));
    await refutePathExists(appSsrDir());

    await RbFileUtils.mkdirPAsync(appFrontendDir().join("ssr").toString());
    await File.writeAsync(appFrontendDir().join("ssr/ssr.js").toString(), SSR_ENTRYPOINT);

    await withinMountedApp("app:vite:build_all");

    await assertPathExists(appSsrDir().join("ssr.js"));
    await refutePathExists(appSsrDir().join(".vite/manifest.json"));
    await refutePathExists(appSsrDir().join(".vite/manifest-assets.json"));

    await withinMountedApp("app:vite:clobber");

    await refutePathExists(appPublicDir());
  });

  it("cli", { timeout: 120_000 }, async () => {
    await withinMountedAppRoot(() => new CLI.Install().call());

    await assertPathExists(viteBinstubPath());
    await assertPathExists(viteConfigTsPath());
    await assertPathExists(procfileDev());
    await assertPathExists(appFrontendDir());

    await withinMountedAppRoot(() => new CLI.Build().call({ mode: "development" }));

    await assertPathExists(appPublicDir());
    await assertPathExists(appPublicDir().join(".vite/manifest.json"));
    await assertPathExists(appPublicDir().join("assets"));

    const write = vi.spyOn(STDOUT, "write");
    await withinMountedAppRoot(() => new CLI.Version().call());
    const output = write.mock.calls.map(([s]) => String(s)).join("");
    expect(output).toContain(ViteTrails.VERSION);
  });

  it("cli commands", { timeout: 60_000 }, async () => {
    await withinMountedAppRoot(async () => {
      await ViteAssets.commands().verifyInstall();

      ViteAssets.reloadWith({ root: Dir.pwd() });

      await new CLI.Install().call();
      await ViteAssets.commands().verifyInstall();
      await new CLI.Version().call();
      vi.spyOn(
        CLI.Install.prototype as unknown as { runWithCapture(): unknown },
        "runWithCapture",
      ).mockResolvedValue(undefined);
      await new CLI.Upgrade().call();
      expect(exec).toHaveBeenLastCalledWith("bin/vite upgrade_packages");
      await new CLI.UpgradePackages().call();

      const { mode, ssrOutputDir } = await ViteAssets.config();
      const run = vi
        .spyOn(ViteAssets.instance(), "run")
        .mockResolvedValue(["stdout", "stderr", { isSuccess: () => true }]);
      expect(await new CLI.Build().call({ mode })).toBeTruthy();
      expect(run.mock.lastCall).toEqual([["build"]]);
      expect(await new CLI.Build().call({ mode, ssr: true })).toBeTruthy();
      expect(run.mock.lastCall).toEqual([["build", "--ssr"]]);

      await RbFileUtils.mkdirPAsync(ssrOutputDir.toString());
      const ssrPath = ssrOutputDir.join("ssr.js");
      await File.writeAsync(ssrPath.toString(), "");
      await new CLI.SSR().call({ mode });
      expect(exec).toHaveBeenLastCalledWith("node", ssrPath.toString());

      expect(await new CLI.Dev().call({ mode, args: ["--wat"] })).toBeTruthy();
      expect(run.mock.lastCall).toEqual([["--wat"], { exec: true }]);

      await new CLI.Clobber().call({ mode });
    });
  });
});
