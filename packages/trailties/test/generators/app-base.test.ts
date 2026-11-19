import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  childProcessAdapterConfig,
  env,
  registerChildProcessAdapter,
  setEnv,
  type ChildProcessAdapter,
} from "@blazetrails/ruby-compat";
import { AppBase, type AppBaseOptions } from "../../lib/generators/app-base.js";
import { AppGenerator } from "../../lib/generators/trails/app/app-generator.js";

class T extends AppBase {
  static {
    this.addSharedOptionsFor("application");
  }
  constructor(...args: ConstructorParameters<typeof AppBase>) {
    super(...args);
    this.implyOptions();
  }
}
const build = ({ appPath = "blog", ...o }: Partial<AppBaseOptions> = {}) =>
  new T([appPath], o, { destinationRoot: "/work" });

describe("AppBase", () => {
  it("defaults: sqlite3, keeps, system tests, destinationRoot joins cwd+appPath", () => {
    const g = build();
    expect(g.sqlite3()).toBe(true);
    expect(g.database.name).toBe("sqlite3");
    expect(g.keeps()).toBe(true);
    expect(g.dependsOnSystemTest()).toBe(true);
    g.setDefaultAccessorsBang();
    expect(g.destinationRoot).toBe("/work/blog");
    const abs = build({ appPath: "/abs/blog" });
    abs.setDefaultAccessorsBang();
    expect(abs.destinationRoot).toBe("/abs/blog");
  });

  it("skip(what), devcontainer, postgres delegate", () => {
    const g = build({ skipActionCable: true, skipKeeps: true, devcontainer: true });
    expect(g["skipActionCable"]()).toBe(true);
    expect(g.keeps()).toBe(false);
    expect(g.isDevcontainer()).toBe(true);
    expect(g.skipDevcontainer()).toBe(false);
    expect(build({ database: "postgresql" }).database.name).toBe("postgres");
    expect(build({ database: "postgresql" }).sqlite3()).toBe(false);
  });

  it("option implications: skipActiveRecord ⇒ skipActiveStorage ⇒ skipActionMailbox/Text", () => {
    const g = build({ skipActiveRecord: true });
    expect(g["skipActiveStorage"]()).toBe(true);
    expect(g.options.skipActionMailbox).toBe(true);
    expect(g["skipActionText"]()).toBe(true);
    expect(
      build({ skipActiveRecord: true, skipActiveStorage: false }).options.skipActiveStorage,
    ).toBe(true);
  });

  it("dependsOnSystemTest false when api or skipTest or skipSystemTest", () => {
    expect(build({ api: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipTest: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipSystemTest: true }).dependsOnSystemTest()).toBe(false);
  });

  it("reports implied options and refuses a conflicting one", async () => {
    const g = build({ skipActiveRecord: true, skipActiveStorage: false });
    const said: string[] = [];
    g.say = ((message: string) => void said.push(message)) as never;
    expect(() => g.reportImpliedOptions()).toThrow("Cannot proceed due to conflicting options");
    expect(said).toContain("  --skip-active-storage [due to --skip-active-record]");
    expect(said).toContain("    ERROR: Conflicts with --no-skip-active-storage");
  });

  it("revokes an implied option through an explicit false on its reason", () => {
    const g = build();
    const implied = g["deduceImpliedOptions"](
      { minimal: true, skipA: false },
      { skipA: ["minimal"], skipB: ["skipA"] },
      ["minimal"],
    );
    expect(implied).toEqual({});
  });

  it("predicates and package lists follow the options", () => {
    const g = build({
      database: "postgresql",
      javascript: "bun",
      skipSolid: true,
      skipActiveStorage: false,
    });
    expect(g["commentIf"]("skipSolid")).toBe("// ");
    expect(g["commentIf"]("skipKamal")).toBe("");
    expect(g["usingBun"]()).toBe(true);
    expect(g["usingNode"]()).toBe(false);
    expect(g["dockerfileBasePackages"]()).toEqual([
      "curl",
      "libjemalloc2",
      "libvips",
      "postgresql-client",
    ]);
    expect(g["ciPackages"]()).toContain("unzip");
    expect(g["ciPackages"]()).toContain("google-chrome-stable");
    expect(g["dockerfileChownDirectories"]()).toEqual(["db", "log", "storage", "tmp"]);
    expect(AppBase.strictArgsPosition()).toBe(false);
  });
});

describe("AppBase dockerfilePnpmVersion", () => {
  it("defaults the app generator's packageManager option to pnpm", () => {
    expect(AppGenerator.classOptions()["packageManager"].default).toBe("pnpm");
  });

  async function withPnpm<T>(capture3: ChildProcessAdapter["capture3"], body: () => Promise<T>) {
    const previous = childProcessAdapterConfig.adapter;
    registerChildProcessAdapter("pnpm-version-test", {
      spawnSync: () => ({ status: 0, signal: null, stdout: "", stderr: "" }),
      capture3,
    });
    childProcessAdapterConfig.adapter = "pnpm-version-test";
    try {
      return await body();
    } finally {
      childProcessAdapterConfig.adapter = previous;
    }
  }

  type Versions = {
    dockerfilePnpmVersion(): Promise<unknown>;
    isPnpmThroughCorepack(): Promise<boolean>;
  };
  const versions = () => build({ javascript: "esbuild" }) as unknown as Versions;

  it("reads the version out of pnpm --version", async () => {
    const commands: unknown[] = [];
    const capture3 = (async (prog: unknown, _env: unknown, args: unknown) => {
      commands.push([prog, args]);
      return ["pnpm 1.22.4\n", "", { status: 0 }];
    }) as unknown as ChildProcessAdapter["capture3"];
    await withPnpm(capture3, async () => {
      expect(await versions().dockerfilePnpmVersion()).toBe("1.22.4");
      expect(await versions().isPnpmThroughCorepack()).toBe(false);
    });
    expect(JSON.stringify(commands)).toContain("pnpm");
  });

  it("answers latest when pnpm cannot run", async () => {
    await withPnpm(undefined, async () => {
      expect(await versions().dockerfilePnpmVersion()).toBe("latest");
      expect(await versions().isPnpmThroughCorepack()).toBe(true);
    });
  });
});

describe("AppBase run tasks", () => {
  const commandsFor = async (options: Record<string, unknown>, method: string) => {
    const generator = new T(["app"], options) as unknown as Record<string, any>;
    const commands: string[] = [];
    generator.trailsCommand = async (command: string) => commands.push(command);
    await generator[method]();
    return commands;
  };

  it("run_javascript installs through the selected bundler", async () => {
    expect(await commandsFor({ javascript: "esbuild" }, "runJavascript")).toEqual([
      "javascript:install:esbuild",
    ]);
    expect(await commandsFor({ javascript: "vite" }, "runJavascript")).toEqual(["vite:install"]);
  });

  it("run_css picks the standalone installer without a JS runtime", async () => {
    expect(await commandsFor({ css: "tailwind" }, "runCss")).toEqual(["tailwindcss:install"]);
    expect(await commandsFor({ css: "bulma" }, "runCss")).toEqual(["css:install:bulma"]);
  });

  it("run_css installs through cssbundling when vite is the JS runtime", async () => {
    expect(await commandsFor({ javascript: "vite", css: "tailwind" }, "runCss")).toEqual([
      "css:install:tailwind",
    ]);
    const g = build({ javascript: "vite" });
    expect(g["usingJsRuntime"]()).toBe(true);
    expect(g["usingNode"]()).toBe(true);
    expect(build({ javascript: "importmap" })["usingJsRuntime"]()).toBe(false);
  });

  it("run_solid leaves out solid_cable when Action Cable is skipped", async () => {
    expect(await commandsFor({ skipActionCable: true }, "runSolid")).toEqual([
      "solid_cache:install solid_queue:install",
    ]);
  });

  it("run tasks do nothing without isInstall", async () => {
    expect(await commandsFor({ skipInstall: true }, "runHotwire")).toEqual([]);
    expect(await commandsFor({ pretend: true }, "runHotwire")).toEqual([]);
  });

  it("runInstall installs through the package manager unless isInstall is false", async () => {
    const previous = childProcessAdapterConfig.adapter;
    const system = vi.fn(async () => ({ pid: 1, status: 1, signal: null }));
    registerChildProcessAdapter("run-install-test", {
      spawnSync: vi.fn(),
      system,
    } as unknown as ChildProcessAdapter);
    childProcessAdapterConfig.adapter = "run-install-test";
    try {
      const generator = (options: Record<string, unknown>) =>
        new T(["app"], options, { destinationRoot: "/tmp" }) as unknown as {
          runInstall(): Promise<void>;
          sayStatus: unknown;
        };
      await generator({ quiet: true, skipInstall: true }).runInstall();
      await generator({ quiet: true, pretend: true }).runInstall();
      expect(system).not.toHaveBeenCalled();

      const quiet = generator({ quiet: true });
      const sayStatus = vi.fn();
      quiet.sayStatus = sayStatus;
      await quiet.runInstall();
      expect(sayStatus).toHaveBeenCalledWith("run", expect.stringMatching(/ install$/));
      expect(system).toHaveBeenCalledOnce();
      expect(system.mock.calls[0]).toEqual([
        expect.stringMatching(/^"\w+" install$/),
        expect.anything(),
        null,
        expect.objectContaining({ out: "/dev/null" }),
      ]);

      const loud = generator({});
      loud.sayStatus = vi.fn();
      await loud.runInstall();
      expect(system).toHaveBeenCalledTimes(2);
      expect((system.mock.calls[1] as unknown[])[3]).not.toHaveProperty("out");
      expect((system.mock.calls[1] as unknown[])[3]).not.toHaveProperty("err");
    } finally {
      childProcessAdapterConfig.adapter = previous;
    }
  });

  it("dockerfile_binfile_fixups writes a literal backslash-r", () => {
    const generator = new T(["app"]) as unknown as Record<string, any>;
    const dir = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fixups-"));
    fs.mkdirSync(path.join(tmp, "bin"));
    fs.writeFileSync(path.join(tmp, "bin/x"), "#!/usr/bin/env ruby\r\n", { mode: 0o755 });
    process.chdir(tmp);
    try {
      expect(generator.dockerfileBinfileFixups()[0]).toBe('sed -i "s/\\r$//g" bin/*');
    } finally {
      process.chdir(dir);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("node_version prefers NODE_VERSION", async () => {
    const generator = new T(["app"], { javascript: "esbuild" }) as unknown as Record<string, any>;
    const before = env.NODE_VERSION;
    setEnv("NODE_VERSION", "1.2.3");
    try {
      expect(await generator.nodeVersion()).toBe("1.2.3");
    } finally {
      setEnv("NODE_VERSION", before);
    }
  });
});
