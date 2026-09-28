import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";
import { AppBuilder, AppGenerator } from "./app-generator.js";
import { TopLevel } from "@blazetrails/activesupport";
import { Generators } from "../generators.js";

describe("AppGenerator (trails-only)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = File.join(Dir.tmpdir(), `trails-app-generator-${SecureRandom.hex(8)}`);
    FileUtils.mkdirP(tmpDir);
  });

  afterEach(() => {
    FileUtils.rmRf(tmpDir);
  });

  it("builds with trails-tsc against db/schema.ts so models need no declares", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
    }).run();

    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.scripts.build).toBe("trails-tsc --schema db/schema.ts");
    expect(pkg.devDependencies["@blazetrails/activerecord-cli"]).toBeDefined();
    expect(File.isExist(File.join(tmpDir, "my-app", "db", "schema.ts"))).toBe(false);
  });

  it("--dev points every @blazetrails package at the local checkout", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
      dev: true,
    }).run();

    const trailties = File.join(Generators.RAILS_DEV_PATH, "packages", "trailties");
    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.dependencies["@blazetrails/trailties"]).toBe(`link:${trailties}`);
    expect(pkg.devDependencies["@blazetrails/trails-tsc"]).toMatch(/^link:.*trails-tsc$/);
    const workspace = File.read(File.join(tmpDir, "my-app", "pnpm-workspace.yaml"));
    expect(workspace).toContain(`  "@blazetrails/trailties": "link:${trailties}"`);
    expect(workspace).toContain(`  "@blazetrails/arel": "link:`);
    expect(workspace).toContain("allowBuilds:\n  better-sqlite3: true\n  esbuild: true\n");
  });

  it("without --dev keeps the version entries and writes no pnpm-workspace.yaml", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
    }).run();

    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.dependencies["@blazetrails/trailties"]).toBe("*");
    expect(File.isExist(File.join(tmpDir, "my-app", "pnpm-workspace.yaml"))).toBe(false);
  });

  it("guards each namespaced environment setting the way the Rails templates do", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
      api: true,
      skipActiveRecord: true,
    }).run();

    const read = (env: string) =>
      File.read(File.join(tmpDir, "my-app", "config", "environments", `${env}.ts`));
    for (const env of ["development", "test", "production"]) {
      expect(read(env)).not.toMatch(/actionController\.performCaching = true/);
      expect(read(env)).not.toMatch(/activeRecord|actionMailer|activeStorage|activeJob/);
    }
    expect(read("development")).toMatch(/actionController\.performCaching = false/);
    expect(read("production")).toMatch(/this\.config\.i18n\.fallbacks = true;/);
    expect(read("production")).toMatch(
      /this\.config\.logger = TaggedLogging\.logger\(process\.stdout\);/,
    );
  });

  it("keeps skipEslint nil when not passed, distinct from an explicit false", () => {
    const build = (o: { skipEslint?: boolean } = {}) =>
      new AppGenerator({ cwd: tmpDir, output: () => {}, appPath: "my-app", ...o });
    expect(build().options.skipEslint).toBeUndefined();
    expect(build({ skipEslint: false }).options.skipEslint).toBe(false);
  });

  it("writes bin/eslint executable, as bin/trails is", async () => {
    await new AppGenerator({ cwd: tmpDir, output: () => {}, appPath: "my-app" }).run();
    expect(File.stat(File.join(tmpDir, "my-app", "bin", "eslint")).mode & 0o777).toBe(0o755);
  });

  it("the generated CI workflow lints with ESLint unless --skip-eslint", async () => {
    const ci = async (opts: Record<string, unknown>): Promise<string> => {
      const dir = File.join(tmpDir, SecureRandom.hex(4));
      FileUtils.mkdirP(dir);
      await new AppGenerator({
        cwd: dir,
        output: () => {},
        appPath: "my-app",
        database: "postgresql",
        ...opts,
      }).run();
      return File.read(File.join(dir, "my-app", ".github", "workflows", "ci.yml"));
    };

    const content = await ci({});
    expect(content).toMatch(/ {2}lint:\n[^]*run: bin\/eslint --format stylish\n\n {2}test:/);
    expect(content).toMatch(/DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432/);
    expect(await ci({ skipEslint: true })).not.toMatch(/lint:|eslint/);
    expect(await ci({ skipTest: true })).not.toMatch(/test:\s*runs-on/);
  });

  it("dispatches cifiles through a top-level AppBuilder when one is defined", async () => {
    const calls: string[] = [];
    TopLevel.AppBuilder = class extends AppBuilder {
      override cifiles(): void {
        calls.push("cifiles");
      }
    };
    try {
      await new AppGenerator({
        cwd: tmpDir,
        output: () => {},
        appPath: "my-app",
        database: "sqlite",
      }).run();
    } finally {
      delete TopLevel.AppBuilder;
    }
    expect(calls).toEqual(["cifiles"]);
    expect(File.isExist(File.join(tmpDir, "my-app", ".github", "workflows", "ci.yml"))).toBe(false);
  });
});
