import { describe, it, expect } from "vitest";
import { env } from "@blazetrails/ruby-compat";
import { AppBase, type AppBaseOptions } from "./app-base.js";

class T extends AppBase {
  protected isValidConst(): void {}
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
    expect(g.devcontainer()).toBe(true);
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

describe("AppBase run tasks", () => {
  const commandsFor = async (options: Record<string, unknown>, method: string) => {
    const generator = new T(["app"], options) as unknown as Record<string, any>;
    const commands: string[] = [];
    generator.railsCommand = async (command: string) => commands.push(command);
    await generator[method]();
    return commands;
  };

  it("run_javascript installs through the selected bundler", async () => {
    expect(await commandsFor({ javascript: "esbuild" }, "runJavascript")).toEqual([
      "javascript:install:esbuild",
    ]);
    expect(await commandsFor({ javascript: "importmap" }, "runJavascript")).toEqual([
      "importmap:install",
    ]);
  });

  it("run_css picks the standalone installer without a JS runtime", async () => {
    expect(await commandsFor({ css: "tailwind" }, "runCss")).toEqual(["tailwindcss:install"]);
    expect(await commandsFor({ css: "bulma" }, "runCss")).toEqual(["css:install:bulma"]);
  });

  it("run_solid leaves out solid_cable when Action Cable is skipped", async () => {
    expect(await commandsFor({ skipActionCable: true }, "runSolid")).toEqual([
      "solid_cache:install solid_queue:install",
    ]);
  });

  it("run tasks do nothing without bundle_install?", async () => {
    expect(await commandsFor({ skipBundle: true }, "runHotwire")).toEqual([]);
    expect(await commandsFor({ pretend: true }, "runHotwire")).toEqual([]);
  });

  it("node_version prefers NODE_VERSION", async () => {
    const generator = new T(["app"], { javascript: "esbuild" }) as unknown as Record<string, any>;
    const before = env.NODE_VERSION;
    env.NODE_VERSION = "1.2.3";
    try {
      expect(await generator.nodeVersion()).toBe("1.2.3");
    } finally {
      if (before === undefined) delete env.NODE_VERSION;
      else env.NODE_VERSION = before;
    }
  });
});
