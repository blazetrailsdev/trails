import { Gem } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Dir,
  File,
  FileUtils,
  SecureRandom,
  env,
  getProcessAdapter,
  setEnv,
} from "@blazetrails/ruby-compat";
import { AppBuilder, AppGenerator } from "../../lib/generators/trails/app/app-generator.js";
import { TopLevel } from "@blazetrails/activesupport";
import { Generators } from "../../lib/generators.js";

describe("AppGenerator (trails-only)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = File.join(Dir.tmpdir(), `trails-app-generator-${SecureRandom.hex(8)}`);
    FileUtils.mkdirP(tmpDir);
  });

  const startDir = process.cwd();
  afterEach(() => {
    process.chdir(startDir);
    FileUtils.rmRf(tmpDir);
  });

  it("sourceRoot names the existing templates directory", async () => {
    const root = (await AppGenerator.sourceRoot()) as string;
    expect(root.endsWith("/generators/trails/app/templates")).toBe(true);
    expect(await File.isDirectory(root)).toBe(true);
  });

  it("ignores public/assets unless the app is API only", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    expect(await File.readAsync(File.join(tmpDir, "my-app/.gitignore"))).toContain(
      "!/tmp/storage/.keep\n\n/public/assets\n\n*.tsbuildinfo\n",
    );
  });

  it("installs pnpm in the Dockerfile through corepack or npm by the pnpm version", async () => {
    for (const [version, install] of [
      [
        "9.15.0",
        "RUN npm install -g corepack && corepack enable && corepack prepare pnpm@$PNPM_VERSION --activate",
      ],
      ["1.9.0", "RUN npm install -g pnpm@$PNPM_VERSION"],
    ]) {
      const root = File.join(tmpDir, version);
      const generator = new AppGenerator(
        ["my-app"],
        { skipInstall: true, javascript: "esbuild" },
        { destinationRoot: root },
      );
      Object.assign(generator, { dockerfilePnpmVersion: async () => version });
      await generator.invokeAll();
      const dockerfile = await File.readAsync(File.join(root, "my-app/Dockerfile"));
      expect(dockerfile).toContain(`ARG PNPM_VERSION=${version}\n${install}\n`);
      expect(dockerfile).toContain(
        "COPY package.json pnpm-lock.yaml ./\nRUN pnpm install --frozen-lockfile\n",
      );
    }
  });

  it("ships Prettier beside ESLint unless --skip-eslint is passed", async () => {
    for (const [skipEslint, present] of [
      [false, true],
      [true, false],
    ]) {
      const root = File.join(tmpDir, String(skipEslint));
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, skipEslint },
        { destinationRoot: root },
      ).invokeAll();
      const app = File.join(root, "my-app");
      const pkg = JSON.parse(await File.readAsync(File.join(app, "package.json")));
      expect(pkg.devDependencies.prettier != null).toBe(present);
      expect(pkg.devDependencies["eslint-config-prettier"] != null).toBe(present);
      expect(await File.isExistAsync(File.join(app, ".prettierrc.json"))).toBe(present);
      expect(await File.isExistAsync(File.join(app, ".prettierignore"))).toBe(present);
      const eslintConfig = File.join(app, "eslint.config.mjs");
      expect(
        (await File.isExistAsync(eslintConfig)) &&
          /eslintConfigPrettier,\n\]\);/.test(await File.readAsync(eslintConfig)),
      ).toBe(present);
    }
  });

  it("templates read the generator's node version", async () => {
    const before = env.NODE_VERSION;
    setEnv("NODE_VERSION", "1.2.3");
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true },
        { destinationRoot: tmpDir },
      ).invokeAll();
    } finally {
      setEnv("NODE_VERSION", before);
    }
    const read = (file: string) => File.readAsync(File.join(tmpDir, "my-app", file));
    expect(await read(".node-version")).toBe("1.2.3\n");
    expect(await read("Dockerfile")).toContain("ARG NODE_VERSION=1.2.3\n");
  });

  it("writes a Dockerfile whose runtime stage runs the compiled server without dev dependencies", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    const dockerfile = await File.readAsync(File.join(tmpDir, "my-app/Dockerfile"));
    expect(dockerfile).toContain("cd dist && ../node_modules/.bin/trails build");
    expect(dockerfile).toContain("RUN pnpm prune --prod");
    expect(dockerfile).toContain("COPY --from=build /app/dist /app\n");
    expect(dockerfile).toContain("COPY --from=build /app/node_modules /app/node_modules\n");
    expect(dockerfile).toContain(
      'CMD ["node", "--no-experimental-strip-types", "node_modules/@blazetrails/rackup/bin/rackup.js", "config.js"]',
    );
    expect(dockerfile).not.toContain("config.ts");
  });

  it("generates action cable files by default", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const cable = fs.readFileSync(path.join(tmpDir, "my-app/config/cable.ts"), "utf-8");
    expect(cable).toContain('adapter: "redis"');
    expect(cable).toContain('channelPrefix: "my_app_production"');
    expect(fs.existsSync(path.join(tmpDir, "my-app/app/channels"))).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, "my-app/package.json"), "utf-8"));
    expect(pkg.dependencies["@blazetrails/trails"]).toBeDefined();
    expect(pkg.dependencies["@blazetrails/solid-queue"]).toBeDefined();
  });

  it("adds @blazetrails/sqlite3 only for a sqlite3 database", async () => {
    for (const [database, expected] of [
      ["sqlite3", true],
      ["postgresql", false],
    ] as const) {
      const root = path.join(tmpDir, database);
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database },
        { destinationRoot: root },
      ).invokeAll();
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "my-app/package.json"), "utf-8"));
      expect(pkg.dependencies["@blazetrails/sqlite3"] !== undefined).toBe(expected);
    }
  });

  it("writes environment files with no node: import and no process reference", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    for (const name of ["development", "test", "production"]) {
      const source = await File.readAsync(
        File.join(tmpDir, `my-app/config/environments/${name}.ts`),
      );
      expect(source).not.toMatch(/from "node:/);
      expect(source).not.toMatch(/\bprocess\./);
    }
  });

  it("writes an inflections initializer whose commented example imports a real export", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    const source = await File.readAsync(
      File.join(tmpDir, "my-app/config/initializers/inflections.ts"),
    );
    const [, names] = source.match(/import \{ (\w+) \} from "@blazetrails\/activesupport"/)!;
    const activesupport: Record<string, unknown> = await import("@blazetrails/activesupport");
    expect(activesupport[names]).toBe(activesupport.inflections);
  });

  it("writes config/boot.ts and imports it first from config/application.ts", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, database: "sqlite" },
      { destinationRoot: tmpDir },
    ).invokeAll();
    expect(fs.existsSync(path.join(tmpDir, "my-app/config/boot.ts"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "my-app/config/application.ts"), "utf8")).toMatch(
      /^import "\.\/boot\.ts";\n/,
    );
  });

  it("boots and builds its views under plain node, with no loader", async () => {
    const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const root = fs.mkdtempSync(path.join(packageDir, "tmp-plain-node-"));
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, skipJavascript: true, database: "sqlite" },
        { destinationRoot: root },
      ).invokeAll();
      const app = path.join(root, "my-app");
      fs.mkdirSync(path.join(app, "node_modules/@blazetrails"), { recursive: true });
      const { dependencies } = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
      const meta = JSON.parse(
        fs.readFileSync(path.resolve(packageDir, "../trails/package.json"), "utf8"),
      );
      for (const name of new Set([
        ...Object.keys(dependencies),
        ...Object.keys(meta.dependencies),
      ])) {
        if (!name.startsWith("@blazetrails/")) continue;
        fs.symlinkSync(
          path.resolve(packageDir, "..", name.slice("@blazetrails/".length)),
          path.join(app, "node_modules", name),
        );
      }
      const node = (args: string[], cwd = app) =>
        spawnSync(getProcessAdapter().execPath!(), args, {
          cwd,
          encoding: "utf8",
          env: { PATH: "", NODE_ENV: "test" },
        });

      const routes = node([path.join(app, "bin", "trails"), "routes"]);
      expect(routes.stderr).toBe("");
      expect(routes.status).toBe(0);

      const fromSubdirectory = node(
        [path.join(app, "bin", "trails"), "routes"],
        path.join(app, "app", "models"),
      );
      expect(fromSubdirectory.stderr).toBe("");
      expect(fromSubdirectory.status).toBe(0);

      const views = node([
        path.join(packageDir, "node_modules/@blazetrails/trails-tsc/bin/trails-tsc-views.js"),
        "build",
        "--views",
        "app/views",
      ]);
      expect(views.stderr).toBe("");
      expect(views.status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("builds with trails-tsc against db/schema.ts so models need no declares", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, database: "sqlite" },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.scripts.build).toBe("trails-tsc --schema db/schema.ts && cp -R bin dist/");
    expect(pkg.devDependencies["@blazetrails/activerecord-cli"]).toBeDefined();
    expect(File.isExist(File.join(tmpDir, "my-app", "db", "schema.ts"))).toBe(false);
  });

  it("writes a release or prerelease Trails version as an npm tilde range", () => {
    const generator = new AppGenerator(["my-app"], {}, { destinationRoot: tmpDir });
    const specifier = (v: string) =>
      (
        generator as unknown as { trailsVersionSpecifier(v: unknown): unknown }
      ).trailsVersionSpecifier(new Gem.Version(v));
    expect(specifier("1.2.3")).toBe("~1.2.3");
    expect(specifier("1.2.3.pre4")).toBe("~1.2.3-pre4");
    expect(specifier("1.2.3.4")).toEqual(["~1.2.3", ">=1.2.3.4"]);
  });

  it("--main without pnpm writes the bare branch specifier", () => {
    const generator = new AppGenerator(
      ["my-app"],
      { main: true, packageManager: "npm" },
      { destinationRoot: tmpDir },
    );
    expect(String(generator.trailsPackageEntry()[0])).toBe(
      '"@blazetrails/trails": "github:blazetrailsdev/trails#main"',
    );
  });

  it("--dev points every @blazetrails package at the local checkout", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, database: "sqlite", dev: true },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const trailties = File.join(Generators.TRAILS_DEV_PATH, "packages", "trailties");
    const trails = File.join(Generators.TRAILS_DEV_PATH, "packages", "trails");
    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.dependencies["@blazetrails/trails"]).toBe(`file:${trails}`);
    expect(pkg.devDependencies["@blazetrails/trails-tsc"]).toMatch(/^file:.*trails-tsc$/);
    const workspace = File.read(File.join(tmpDir, "my-app", "pnpm-workspace.yaml"));
    expect(workspace).toContain(`  "@blazetrails/trailties": "link:${trailties}"`);
    expect(workspace).toContain(`  "@blazetrails/trails": "link:${trails}"`);
    expect(workspace).toContain(`  "@blazetrails/arel": "link:`);
    expect(workspace).toContain("allowBuilds:\n  better-sqlite3: true\n  esbuild: true\n");
  });

  it("without --dev keeps the version entries and writes no pnpm-workspace.yaml", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, database: "sqlite", packageManager: "npm" },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.dependencies["@blazetrails/trails"]).toBe("~0.1.0-alpha0.1");
    expect(pkg.dependencies["@blazetrails/trailties"]).toBeUndefined();
    expect(pkg.dependencies["@blazetrails/activerecord"]).toBeUndefined();
    expect(pkg.dependencies["@blazetrails/rackup"]).toBe("~0.1.0-alpha0.1");
    expect(File.isExist(File.join(tmpDir, "my-app", "pnpm-workspace.yaml"))).toBe(false);
  });

  it("hoists every @blazetrails package the templates import under pnpm", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, database: "sqlite" },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const workspace = File.read(File.join(tmpDir, "my-app", "pnpm-workspace.yaml"));
    expect(workspace).toContain('publicHoistPattern:\n  - "@blazetrails/*"\n');
    expect(workspace).not.toContain("overrides:");
  });

  it("guards each namespaced environment setting the way the Rails templates do", async () => {
    await new AppGenerator(
      ["my-app"],
      {
        skipInstall: true,
        database: "sqlite",
        api: true,
        skipActiveRecord: true,
        skipActionMailer: true,
      },
      { destinationRoot: tmpDir },
    ).invokeAll();

    const read = (env: string) =>
      File.read(File.join(tmpDir, "my-app", "config", "environments", `${env}.ts`));
    for (const env of ["development", "test", "production"]) {
      expect(read(env)).not.toMatch(/actionController\.performCaching = true/);
      expect(read(env)).not.toMatch(/activeRecord|actionMailer|activeStorage/);
    }
    expect(read("development")).toMatch(/actionController\.performCaching = false/);
    expect(read("production")).toMatch(/this\.config\.i18n\.fallbacks = true;/);
    expect(read("production")).toMatch(/this\.config\.logger = TaggedLogging\.logger\(STDOUT\);/);
  });

  it("generates an app with Active Job on unless --skip-active-job is passed", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();

    expect(File.isExist(File.join(tmpDir, "my-app", "app", "jobs", "application-job.ts"))).toBe(
      true,
    );
    expect(
      File.read(File.join(tmpDir, "my-app", "config", "environments", "development.ts")),
    ).toMatch(/this\.config\.activeJob\.verboseEnqueueLogs = true;/);

    await new AppGenerator(
      ["skipped-app"],
      { skipInstall: true, skipActiveJob: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    expect(File.isExist(File.join(tmpDir, "skipped-app", "app", "jobs"))).toBe(false);
  });

  it("keeps skipEslint nil when not passed, distinct from an explicit false", () => {
    const build = (o: { skipEslint?: boolean } = {}) =>
      new AppGenerator(["my-app"], { skipInstall: true, ...o }, { destinationRoot: tmpDir });
    expect(build().options.skipEslint).toBeUndefined();
    expect(build({ skipEslint: false }).options.skipEslint).toBe(false);
  });

  it("writes bin/eslint executable, as bin/trails is", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    expect(File.stat(File.join(tmpDir, "my-app", "bin", "eslint")).mode & 0o777).toBe(0o755);
  });

  it("the generated CI workflow lints with ESLint unless --skip-eslint", async () => {
    const ci = async (opts: Record<string, unknown>): Promise<string> => {
      const dir = File.join(tmpDir, SecureRandom.hex(4));
      FileUtils.mkdirP(dir);
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database: "postgresql", ...opts },
        { destinationRoot: dir },
      ).invokeAll();
      return File.read(File.join(dir, "my-app", ".github", "workflows", "ci.yml"));
    };

    const content = await ci({});
    expect(content).toMatch(/ {2}lint:\n[^]*run: bin\/eslint --format stylish\n\n {2}test:/);
    expect(content).toMatch(/DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432/);
    expect(content).toMatch(/run: bin\/trails db:test:prepare && \w+ test\n/);
    expect(await ci({ skipEslint: true })).not.toMatch(/lint:|eslint/);
    expect(await ci({ skipTest: true })).not.toMatch(/test:\s*runs-on/);
  });

  it("dispatches cifiles through a top-level AppBuilder when one is defined", async () => {
    const calls: string[] = [];
    TopLevel.AppBuilder = class extends AppBuilder {
      override async cifiles(): Promise<void> {
        calls.push("cifiles", (this as unknown as { appPath: string }).appPath);
      }
    };
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database: "sqlite" },
        { destinationRoot: tmpDir },
      ).invokeAll();
    } finally {
      delete TopLevel.AppBuilder;
    }
    expect(calls).toEqual(["cifiles", "my-app"]);
    expect(File.isExist(File.join(tmpDir, "my-app", ".github", "workflows", "ci.yml"))).toBe(false);
  });

  it("runs a standalone top-level AppBuilder's own constructor and class fields", async () => {
    const seen: unknown[] = [];
    TopLevel.AppBuilder = class {
      marker = "field";
      constructor(generator: unknown) {
        seen.push(generator instanceof AppGenerator);
      }
      async cifiles(this: { marker: string }): Promise<void> {
        seen.push(this.marker);
      }
    };
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database: "sqlite" },
        { destinationRoot: tmpDir },
      ).invokeAll();
    } finally {
      delete TopLevel.AppBuilder;
    }
    expect(seen).toEqual([true, "field"]);
  });

  it("includes ActionMethods into a top-level AppBuilder that does not subclass trails' AppBuilder", async () => {
    let kept: unknown = null;
    TopLevel.AppBuilder = class {
      async cifiles(this: {
        emptyDirectory(d: string): unknown;
        emptyDirectoryWithKeepFile(d: string): Promise<unknown>;
      }): Promise<void> {
        await this.emptyDirectory("custom-ci");
        kept = await this.emptyDirectoryWithKeepFile("custom-keep");
      }
    };
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true, database: "sqlite" },
        { destinationRoot: tmpDir },
      ).invokeAll();
    } finally {
      delete TopLevel.AppBuilder;
    }
    expect(File.isDirectory(File.join(tmpDir, "my-app", "custom-ci"))).toBe(true);
    expect(File.isExist(File.join(tmpDir, "my-app", "custom-keep", ".keep"))).toBe(true);
    expect(kept).toBe("custom-keep/.keep");
    expect(File.isExist(File.join(tmpDir, "my-app", ".github"))).toBe(false);
  });

  it("honors the skip options create_* guards read", async () => {
    await new AppGenerator(
      ["my-app"],
      { skipInstall: true, skipGit: true, skipActiveRecord: true, skipTest: true, dummyApp: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    const exists = (file: string) => File.isExist(File.join(tmpDir, "my-app", file));
    expect(exists(".gitignore")).toBe(false);
    expect(exists(".gitattributes")).toBe(false);
    expect(exists("config/database.ts")).toBe(false);
    expect(exists("db/seeds.ts")).toBe(false);
    expect(exists("test/test-helper.ts")).toBe(false);
    expect(exists("Dockerfile")).toBe(false);
  });

  it("writes the system test keep file unless skipKeeps", async () => {
    await new AppGenerator(
      ["kept"],
      { skipInstall: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    await new AppGenerator(
      ["bare"],
      { skipInstall: true, skipKeeps: true },
      { destinationRoot: tmpDir },
    ).invokeAll();
    expect(File.isExist(File.join(tmpDir, "kept/test/system/.keep"))).toBe(true);
    expect(File.isExist(File.join(tmpDir, "bare/test/system/.keep"))).toBe(false);
    expect(File.isExist(File.join(tmpDir, "bare/test/application-system-test-case.ts"))).toBe(true);
  });

  it("dispatches Rails' root steps to a builder that answers them", async () => {
    const calls: string[] = [];
    TopLevel.AppBuilder = class extends AppBuilder {
      async rakefile(): Promise<void> {
        calls.push("rakefile");
      }
      async versionControl(): Promise<void> {
        calls.push("versionControl");
      }
    };
    try {
      await new AppGenerator(
        ["my-app"],
        { skipInstall: true },
        { destinationRoot: tmpDir },
      ).invokeAll();
    } finally {
      delete TopLevel.AppBuilder;
    }
    expect(calls).toEqual(["rakefile", "versionControl"]);
  });
});
