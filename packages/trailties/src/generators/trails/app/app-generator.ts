import type { ThorClass } from "@blazetrails/thor";
import { File } from "@blazetrails/ruby-compat";
import { TopLevel, titleize } from "@blazetrails/activesupport";
import { ref, tsClass, tsField, tsModule, tsRaw } from "../../../template-builder/index.js";
import { AppBase, CSS_OPTIONS, JAVASCRIPT_OPTIONS, type AppBaseOptions } from "../../app-base.js";
import type { GeneratorConfig } from "../../base.js";
import { Trails } from "../../../trails.js";
import { GeneratorError } from "../../generated-attribute.js";
import { type DatabaseName } from "../../database.js";
import { LOAD_DEFAULTS_VERSION } from "../../../application/configuration.js";
import { VERSION } from "../../../gem-version.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

const UNPORTED_SUBSYSTEM_SKIP_DEFAULTS: Readonly<Record<string, boolean>> = {
  skipActionMailer: true,
  skipActiveStorage: true,
};

const META_OPTIONS = ["minimal"];

const DB_ALIAS: Record<string, DatabaseName> = {
  sqlite: "sqlite3",
  postgres: "postgresql",
};

export type AppDatabase = "sqlite" | "postgres" | "mysql" | DatabaseName;
export type PackageManager = "pnpm" | "npm";
export type SqliteDriver = "better-sqlite3" | "node-sqlite" | "expo-sqlite";

export const VALID_PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm"];
export const VALID_SQLITE_DRIVERS: readonly SqliteDriver[] = [
  "better-sqlite3",
  "node-sqlite",
  "expo-sqlite",
];

export interface AppGeneratorOptions extends Omit<AppBaseOptions, "database" | "appPath"> {
  dummyApp?: boolean;
  appPath?: string;
  database?: AppDatabase;
  packageManager?: PackageManager;
  sqliteDriver?: SqliteDriver;
}

const TRAILS = "trails";

export class ActionMethods {
  declare readonly options: AppBaseOptions;
  /** @internal */
  declare private generator: AppGenerator;

  constructor(generator: AppGenerator) {
    this.generator = generator;
    this.options = generator.options;
    return new Proxy(this, {
      get: (target, key, receiver) =>
        key in target ? Reflect.get(target, key, receiver) : target.methodMissing(key),
    });
  }

  /** @internal */
  protected async template(source: string, ...args: unknown[]): Promise<void> {
    await this.generator.template(source, ...args);
  }

  /** @internal */
  protected copyFile(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "copyFile"
    ](...args);
  }

  /** @internal */
  protected directory(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "directory"
    ](...args);
  }

  /** @internal */
  protected emptyDirectory(destination: string, config: { verbose?: boolean } = {}): unknown {
    return this.generator["emptyDirectory"](destination, config);
  }

  /** @internal */
  protected inside(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)["inside"](
      ...args,
    );
  }

  /** @internal */
  protected emptyDirectoryWithKeepFile(
    destination: string,
    config: { verbose?: boolean } = {},
  ): Promise<unknown> {
    return this.generator["emptyDirectoryWithKeepFile"](destination, config);
  }

  /** @internal */
  protected keepFile(destination: string): Promise<unknown> {
    return this.generator["keepFile"](destination);
  }

  /** @internal */
  protected createFile(...args: Parameters<AppGenerator["createFile"]>): unknown {
    return this.generator.createFile(...args);
  }

  /** @internal */
  protected chmod(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)["chmod"](
      ...args,
    );
  }

  /** @internal */
  protected shebang(...args: unknown[]): unknown {
    return (this.generator as unknown as Record<string, (...args: unknown[]) => unknown>)[
      "shebang"
    ](...args);
  }

  /** @internal */
  private methodMissing(key: string | symbol): unknown {
    const value = (this.generator as unknown as Record<string | symbol, unknown>)[key];
    return typeof value === "function" ? value.bind(this.generator) : value;
  }
}

Trails.ActionMethods = ActionMethods;

export class AppBuilder extends ActionMethods {
  /** @internal */
  declare private readonly appPath: string;
  /** @internal */
  declare private readonly database: AppGenerator["database"];
  /** @internal */
  declare private readonly packageManager: PackageManager;
  /** @internal */
  declare private readonly sqliteDriver: SqliteDriver;
  /** @internal */
  declare private readonly appName: () => string;
  /** @internal */
  declare private readonly appConstBase: () => string;
  /** @internal */
  declare private readonly trailsRequireStatement: () => string;
  /** @internal */
  declare private readonly trailsGemfileEntry: (name: string, packageManager: string) => string;
  /** @internal */
  declare private readonly trailsDevPackages: () => Record<string, string>;
  /** @internal */
  declare private readonly dependsOnSystemTest: () => boolean;
  /** @internal */
  declare private readonly skipActionCable: () => boolean | undefined;
  /** @internal */
  declare private readonly skipActionMailer: () => boolean | undefined;
  /** @internal */
  declare private readonly skipActiveRecord: () => boolean | undefined;
  /** @internal */
  declare private readonly skipActiveStorage: () => boolean | undefined;
  /** @internal */
  declare private readonly skipEslint: () => boolean | undefined;
  /** @internal */
  declare private readonly skipSolid: () => boolean | undefined;
  /** @internal */
  declare private readonly gitInitCommand: () => Promise<string>;
  /** @internal */
  declare private readonly run: (command: unknown, config?: object) => Promise<unknown>;
  /** @internal */
  declare private readonly destinationRoot: string;
  /** @internal */
  declare private readonly removeFile: (path: string) => Promise<unknown>;
  /** @internal */
  declare private readonly skipAssetPipeline: () => boolean | undefined;
  /** @internal */
  private _configTargetVersion: string | null = null;

  /** @internal */
  private pmRun(): string {
    return this.packageManager === "npm" ? "npm run" : this.packageManager;
  }

  /** @internal */
  private pmInstall(): string {
    return `${this.packageManager} install`;
  }

  /** @internal */
  private pmLockFile(): string {
    return this.packageManager === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json";
  }

  /** @internal */
  private trailsGemfileEntries(names: string[]): Record<string, string> {
    return Object.fromEntries(
      names.map((n) => [n, this.trailsGemfileEntry(n, this.packageManager)]),
    );
  }

  /** @missingRailsCall copy_file — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async readme(): Promise<void> {
    const name = File.basename(this.appPath);
    await this.createFile(
      "README.md",
      `# ${name}

This application was generated with [trails](https://github.com/blazetrailsdev/blazetrails).

## Getting started

    cd ${name}
    ${this.pmInstall()}
    ${this.pmRun()} db:setup
    ${this.pmRun()} dev

To reach a CLI command with no script of its own, use the \`bin/trails\` binstub:

    bin/trails routes
    bin/trails console

## Commands

| Command | Description |
| --- | --- |
| \`${this.pmRun()} dev\` | Start the development server |
| \`bin/trails generate model NAME\` | Generate a new model |
| \`bin/trails generate controller NAME\` | Generate a new controller |
| \`bin/trails generate scaffold NAME\` | Generate a full CRUD resource |
| \`${this.pmRun()} db:migrate\` | Run pending database migrations |
| \`${this.pmRun()} db:seed\` | Seed the database |
| \`${this.pmRun()} test\` | Run the test suite |

## Configuration

- Database: \`config/database.ts\`
- Routes: \`config/routes.ts\`
- Environment-specific: \`config/environments/\`

## Views and deployment

\`.tse\` views are precompiled into \`.trails/views/\`. In development,
\`${this.pmRun()} dev\` watches \`app/views/\`, rebuilds a changed view and
re-imports it on the next render. In production templates load once from the
deploy-time build, so the deploy must run \`trails-tsc-views build --views
app/views\` (the \`prepare\` script) before the server boots; a view with no
built module raises \`LoadError\`.
`,
    );
  }

  async nodeVersion(): Promise<void> {
    await this.template("node-version", ".node-version");
  }

  /** @missingRailsArgs template — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async rubyVersion(): Promise<void> {
    await this.template("node-version", ".node-version");
  }

  /** @missingRailsCall template — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async gemfile(): Promise<void> {
    const name = File.basename(this.appPath);
    const dep = this.database.pkgDependency;
    const dbDep =
      this.database.name === "sqlite3" && this.sqliteDriver !== "better-sqlite3"
        ? this.sqliteDriver === "expo-sqlite"
          ? { "expo-sqlite": "^15.0.0" }
          : {}
        : { [dep.name]: dep.version };
    await this.createFile(
      "package.json",
      JSON.stringify(
        {
          name,
          version: "0.1.0",
          private: true,
          type: "module",
          exports: {
            "./*.tse": {
              types: "./.trails/views/*.tse.d.ts",
              default: "./.trails/views/*.tse.js",
            },
          },
          scripts: {
            build: "trails-tsc --schema db/schema.ts",
            test: "vitest run",
            trails: TRAILS,
            dev: `${TRAILS} server`,
            "db:create": `${TRAILS} db create`,
            "db:migrate": `${TRAILS} db migrate`,
            "db:seed": `${TRAILS} db seed`,
            "db:setup": `${TRAILS} db create && ${TRAILS} db migrate && ${TRAILS} db seed`,
            "db:reset": `${TRAILS} db drop && ${TRAILS} db create && ${TRAILS} db migrate && ${TRAILS} db seed`,
            prepare: "trails-tsc-views build --views app/views",
          },
          dependencies: {
            ...this.trailsGemfileEntries([
              "@blazetrails/activerecord",
              "@blazetrails/activemodel",
              "@blazetrails/date",
              "@blazetrails/activesupport",
              "@blazetrails/rack",
              "@blazetrails/ruby-compat",
              "@blazetrails/actionpack",
              "@blazetrails/actionview",
              "@blazetrails/trailties",
              ...(this.options.skipActiveJob ? [] : ["@blazetrails/activejob"]),
              ...(this.skipSolid() ? [] : ["@blazetrails/solid-queue"]),
              ...(this.skipActionCable() ? [] : ["@blazetrails/actioncable"]),
            ]),
            ...dbDep,
          },
          devDependencies: {
            ...this.trailsGemfileEntries([
              "@blazetrails/activerecord-cli",
              "@blazetrails/trails-tsc",
            ]),
            "@types/node": "^22.0.0",
            typescript: "^5.8.0",
            vite: "^7.0.0",
            vitest: "^3.0.0",
            ...(this.skipEslint()
              ? {}
              : { "@eslint/js": "^10.0.1", eslint: "^10.0.3", "typescript-eslint": "^8.57.0" }),
          },
          ...(this.options.dev && this.packageManager !== "pnpm"
            ? {
                overrides: this.trailsGemfileEntries(Object.keys(this.trailsDevPackages())),
              }
            : {}),
        },
        null,
        2,
      ) + "\n",
    );

    if (this.options.dev && this.packageManager === "pnpm") {
      const overrides = this.trailsGemfileEntries(Object.keys(this.trailsDevPackages()));
      await this.createFile(
        "pnpm-workspace.yaml",
        [
          "overrides:",
          ...Object.entries(overrides).map(
            ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
          ),
          "allowBuilds:",
          "  better-sqlite3: true",
          "  esbuild: true",
          "",
        ].join("\n"),
      );
    }

    await this.createFile(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "Node16",
            moduleResolution: "Node16",
            declaration: true,
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            allowArbitraryExtensions: true,
            rewriteRelativeImportExtensions: true,
            erasableSyntaxOnly: true,
            types: ["node"],
            rootDir: ".",
            outDir: "dist",
            plugins: [{ name: "@blazetrails/trails-tsc/ts-plugin", viewsDir: "app/views" }],
          },
          include: [
            "app",
            "config",
            "db",
            ".trails/template-registry-augmentation.d.ts",
            ".trails/routes-augmentation.d.ts",
            ".trails/views",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }

  /** @missingRailsArgs template — PERMANENT */
  async rakefile(): Promise<void> {
    await this.template("Rakefile.ts");
  }

  /** @missingRailsCall template — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async configru(): Promise<void> {
    await this.createFile(
      "config.ts",
      `// This file is used by Rack-based servers to start the application.
import { Trails } from "@blazetrails/trailties";

import "./config/environment.ts";

export const Config = Trails.application;

await Trails.application.loadServer();
`,
    );

    await this.createFile(
      "vite.config.ts",
      `/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "app",
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
${
  this.dependsOnSystemTest()
    ? `    globalSetup: ["test/global-setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/{system,dummy,fixtures}/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "system",
          include: ["test/system/**/*.test.ts"],
          pool: "forks",
          provide: { screenshotDirectory: "tmp/screenshots" },
        },
      },
    ],
`
    : `    include: ["test/**/*.test.ts"],
    exclude: ["test/{system,dummy,fixtures}/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
`
}  },
  publicDir: false,
  build: {
    outDir: "../public/assets",
    assetsDir: ".",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        application: fileURLToPath(
          new URL("app/assets/stylesheets/application.css", import.meta.url),
        ),
      },
    },
  },
});
`,
    );
  }

  async gitignore(): Promise<void> {
    await this.template("gitignore", ".gitignore");
  }

  async gitattributes(): Promise<void> {
    await this.template("gitattributes", ".gitattributes");
  }

  /**
   * @missingRailsCall chmod — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsCall template — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   */
  async dockerfiles(): Promise<void> {
    await this.createFile(
      "Dockerfile",
      `# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.16.0
FROM node:${"${NODE_VERSION}"}-slim AS base

LABEL fly_launch_runtime="Trails"

WORKDIR /app

ENV TRAILS_ENV="production" \\
    NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json ${this.pmLockFile()}* ./
RUN ${this.packageManager === "pnpm" ? "corepack enable pnpm && pnpm install" : this.pmInstall()}

COPY . .
RUN ${this.packageManager === "pnpm" ? "pnpm" : this.packageManager} run build

FROM base

COPY --from=build /app /app

EXPOSE 3000
CMD ["npx", "trails", "server"]
`,
    );

    await this.createFile(
      ".dockerignore",
      `# See https://docs.docker.com/engine/reference/builder/#dockerignore-file
.git
.gitignore
node_modules
log/*
tmp/*
dist
`,
    );
  }

  async cifiles(): Promise<void> {
    await this.emptyDirectory(".github/workflows");
    await this.template("github/ci.yml", ".github/workflows/ci.yml");
    await this.template("github/dependabot.yml", ".github/dependabot.yml");
  }

  /** @missingRailsArgs template — PERMANENT */
  async eslint(): Promise<void> {
    await this.template("eslint.config.mjs");
  }

  async versionControl(): Promise<void> {
    if (!this.options.skipGit && !this.options.pretend) {
      await this.run(await this.gitInitCommand(), {
        capture: this.options.quiet,
        abortOnFailure: false,
      });
    }
  }

  /** @missingRailsCall directory — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async app(): Promise<void> {
    const name = File.basename(this.appPath);
    await this.createFile(
      "app/controllers/application-controller.ts",
      tsModule({
        imports: [{ from: "@blazetrails/actionpack", named: { ActionController: "named" } }],
        declarations: [
          tsClass({
            name: "ApplicationController",
            extends: ref(`ActionController.${this.options.api ? "API" : "Base"}`),
            body: [],
          }),
        ],
      }),
    );

    await this.createFile(
      "app/models/application-record.ts",
      tsModule({
        imports: [{ from: "@blazetrails/activerecord", named: { Base: "named" } }],
        declarations: [
          tsRaw(
            `export class ApplicationRecord extends Base {\n  static {\n    this.primaryAbstractClass();\n  }\n}`,
          ),
        ],
      }),
    );

    await this.createFile(
      "app/helpers/application-helper.ts",
      tsModule({ declarations: [tsRaw(`export const ApplicationHelper = {\n};`)] }),
    );

    if (!this.options.skipActiveJob) {
      await this.template("app/jobs/application_job.ts", "app/jobs/application-job.ts");
    }

    if (!this.skipActionMailer()) {
      await this.createFile(
        "app/mailers/application-mailer.ts",
        tsModule({
          declarations: [
            tsClass({
              name: "ApplicationMailer",
              body: [
                tsField("defaultFrom", "string", {
                  inferType: true,
                  initializer: '"from@example.com"',
                }),
                tsField("layout", "string", { inferType: true, initializer: '"mailer"' }),
              ],
            }),
          ],
        }),
      );
    }

    await this.createFile(
      "app/views/layouts/application.html.tse",
      `<!DOCTYPE html>
<html>
  <head>
    <title><%= contentFor("title") ?? "${titleize(this.appName())}" %></title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <%= csrfMetaTags() %>
    <%= cspMetaTag() %>

    <%= yield("head") %>

    <%# Enable PWA manifest for installable apps (make sure to enable in config/routes.ts too!) %>
    <%#= tag.link({ rel: "manifest", href: pwaManifestPath({ format: "json" }) }) %>

    <link rel="icon" href="/icon.png" type="image/png">
    <link rel="icon" href="/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/icon.png">

    <%# Includes all stylesheet files in app/assets/stylesheets %>
    <%= stylesheetLinkTag("application") %>
  </head>

  <body>
    <%= yield %>
  </body>
</html>
`,
    );

    if (!this.skipActionMailer()) {
      await this.createFile(
        "app/views/layouts/mailer.html.tse",
        `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <style>
    /* Email styles */
  </style>
</head>
<body>
  <%= yield %>
</body>
</html>
`,
      );

      await this.createFile(
        "app/views/layouts/mailer.text.tse",
        `<%= yield %>
`,
      );
    }

    await this.createFile(
      "app/assets/stylesheets/application.css",
      `/*
 * This is a manifest file that'll be compiled into application.css,
 * which will include all the files listed below.
 *
 * Any CSS (and SCSS, if configured) file within app/assets/stylesheets
 * or any plugin's vendor/assets/stylesheets directory can be referenced here.
 */
`,
    );

    await this.emptyDirectoryWithKeepFile("app/assets/images");

    await this.keepFile("app/controllers/concerns");
    await this.keepFile("app/models/concerns");
  }

  /**
   * @missingRailsCall chmod — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsCall directory — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsCall shebang — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   */
  async bin(): Promise<void> {
    const excludePattern = [this.skipEslint() ? /eslint/ : null].filter((p) => p != null);

    await this.createFile(
      "bin/trails",
      `#!/usr/bin/env node
import { join } from "node:path";
import { setAppPath } from "@blazetrails/trailties/app-path";

setAppPath(join(import.meta.dirname, "../config/application.ts"));
await import("@blazetrails/trailties/commands");
`,
      { perm: 0o755 },
    );

    if (!excludePattern.some((p) => p.test("bin/eslint"))) {
      await this.createFile(
        "bin/eslint",
        `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// explicit eslint config increases performance slightly while avoiding config confusion.
const { status } = spawnSync(
  join(root, "node_modules", ".bin", "eslint"),
  ["--config", join(root, "eslint.config.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(status ?? 1);
`,
        { perm: 0o755 },
      );
    }

    await this.createFile(
      "bin/setup",
      `#!/usr/bin/env node
import { execSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";

function system(command) {
  console.log(\`  $ \${command}\`);
  execSync(command, { stdio: "inherit" });
}

console.log("== Installing dependencies ==");
system("${this.pmInstall()}");

console.log("\\n== Preparing database ==");
system("bin/trails db setup");

console.log("\\n== Removing old logs and tempfiles ==");
for (const dir of ["log", "tmp"]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
mkdirSync("tmp/pids", { recursive: true });

console.log("\\n== Done! ==");
`,
      { perm: 0o755 },
    );

    await this.createFile(
      "bin/dev",
      `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { status } = spawnSync(
  join(dirname(fileURLToPath(import.meta.url)), "trails"),
  ["server", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(status ?? 1);
`,
      { perm: 0o755 },
    );
  }

  /**
   * @missingRailsCall directory — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsCall empty_directory — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsCall inside — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions
   * @missingRailsArgs template — PERMANENT
   */
  async config(): Promise<void> {
    const name = File.basename(this.appPath);
    await this.createFile(
      "config/application.ts",
      `import "./boot.ts";

import { Application } from "@blazetrails/trailties";

${this.trailsRequireStatement()}

export class ${this.appConstBase()} extends Application {
  static {
    Application.register(this, import.meta.dirname);

    // Initialize configuration defaults for originally generated trails version.
    this.config.loadDefaults("${this.configTargetVersion()}");
${
  this.options.api
    ? `
    // Only loads a smaller set of middleware suitable for API only apps.
    // Middleware like session, flash, cookies can be added back manually.
    // Skip views, helpers and assets when generating a new resource.
    this.config.apiOnly = true;
`
    : ""
}  }

  // Configuration for the application, engines, and trailties goes here.
  //
  // These settings can be overridden in specific environments using the files
  // in config/environments, which are processed later.
  //
  // config.timeZone = "Central Time (US & Canada)";
  // config.eagerLoadPaths.push("extras");
}

// Please, add to the \`ignore\` list any other \`lib\` subdirectories that do
// not contain \`.ts\` files, or that should not be reloaded or eager loaded.
// Common ones are \`templates\`, \`generators\`, or \`middleware\`, for example.
await ${this.appConstBase()}.config.autoloadLib({ ignore: ["assets", "tasks"] });

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: ${this.appConstBase()};
  }
}
`,
    );

    await this.createFile(
      "config/environment.ts",
      `import { Trails } from "@blazetrails/trailties";

// Load the trails application.
import "./application.ts";

Trails.autoloaders.each((loader) => {
  loader.importer = (url) => import(url);
});

// Initialize the trails application.
export default await Trails.initialize();
`,
    );

    if (!this.options.update) await this.template("config/routes.ts");

    if (!(this.options.update || this.options.skipActionCable)) {
      await this.template("config/cable.ts");
    }

    if (!(this.options.update || this.skipActiveStorage())) {
      await this.template("config/storage.ts");
    }

    await this.createFile(
      "config/environments/development.ts",
      `import { existsSync } from "node:fs";
import { join } from "node:path";
import { days } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // Make code changes take effect immediately without server restart.
  this.config.enableReloading = true;

  // Do not eager load code on boot.
  this.config.eagerLoad = false;

  // Show full error reports.
  this.config.considerAllRequestsLocal = true;

  // Enable server timing.
  this.config.serverTiming = true;

  // Enable/disable Action Controller caching. By default Action Controller caching is disabled.
  // Run trails dev:cache to toggle Action Controller caching.
  if (existsSync(join(this.config.root!, "tmp/caching-dev.txt"))) {
${
  this.options.api
    ? ""
    : `    this.config.actionController.performCaching = true;
    this.config.actionController.enableFragmentCacheLogging = true;
`
}    this.config.publicFileServer.headers = { "cache-control": \`public, max-age=\${days(2).toI()}\` };
  } else {
    this.config.actionController.performCaching = false;
  }

  // Change to :null_store to avoid any caching.
  this.config.cacheStore = ":memory_store";
${
  this.skipActiveStorage()
    ? ""
    : `
  // Store uploaded files on the local file system (see config/storage.ts for options).
  this.config.activeStorage.service = "local";
`
}${
        this.skipActionMailer()
          ? ""
          : `
  // Don't care if the mailer can't send.
  this.config.actionMailer.raiseDeliveryErrors = false;

  // Make template changes take effect immediately.
  this.config.actionMailer.performCaching = false;

  // Set localhost to be used by links generated in mailer templates.
  this.config.actionMailer.defaultUrlOptions = { host: "localhost", port: 3000 };
`
      }
  // Print deprecation notices to the Trails logger.
  this.config.activeSupport.deprecation = "log";

${
  this.skipActiveRecord()
    ? ""
    : `  // Raise an error on page load if there are pending migrations.
  this.config.activeRecord.migrationError = "page_load";

  // Highlight code that triggered database queries in logs.
  this.config.activeRecord.verboseQueryLogs = true;

  // Append comments with runtime information tags to SQL queries in logs.
  this.config.activeRecord.queryLogTagsEnabled = true;

`
}${
        this.options.skipActiveJob
          ? ""
          : `  // Highlight code that enqueued background job in logs.
  this.config.activeJob.verboseEnqueueLogs = true;

`
      }  // Raises error for missing translations.
  // this.config.i18n.raiseOnMissingTranslations = true;

  // Annotate rendered view with file names.
  this.config.actionView.annotateRenderedViewWithFilenames = true;

${
  this.skipActionCable()
    ? ""
    : `  // Uncomment if you wish to allow Action Cable access from any origin.
  // this.config.actionCable.disableRequestForgeryProtection = true;

`
}  // Raise error when a before_action's only/except options reference missing actions.
  this.config.actionController.raiseOnMissingCallbackActions = true;
${
  this.skipEslint()
    ? ""
    : `
  // Apply autocorrection by ESLint to files generated by \`bin/trails generate\`.
  // this.config.generators().applyEslintAutocorrectAfterGenerateBang();
`
}});
`,
    );

    await this.createFile(
      "config/environments/test.ts",
      `// The test environment is used exclusively to run your application's
// test suite. You never need to work with it otherwise. Remember that
// your test database is "scratch space" for the test suite and is wiped
// and recreated between test runs. Don't rely on the data there!

import { isPresent } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // While tests run files are not watched, reloading is not necessary.
  this.config.enableReloading = false;

  // Eager loading loads your entire application. When running a single test locally,
  // this is usually not necessary, and can slow down your test suite. However, it's
  // recommended that you enable it in continuous integration systems to ensure eager
  // loading is working properly before deploying your code.
  this.config.eagerLoad = isPresent(process.env.CI);

  // Configure public file server for tests with cache-control for performance.
  this.config.publicFileServer.headers = { "cache-control": "public, max-age=3600" };

  // Show full error reports.
  this.config.considerAllRequestsLocal = true;
  this.config.cacheStore = ":null_store";

  // Render exception templates for rescuable exceptions and raise for other exceptions.
  this.config.actionDispatch.showExceptions = "rescuable";

  // Disable request forgery protection in test environment.
  this.config.actionController.allowForgeryProtection = false;

${
  this.skipActiveStorage()
    ? ""
    : `  // Store uploaded files on the local file system in a temporary directory.
  this.config.activeStorage.service = "test";

`
}${
        this.skipActionMailer()
          ? ""
          : `  // Tell Action Mailer not to deliver emails to the real world.
  // The "test" delivery method accumulates sent emails in the
  // ActionMailer.Base.deliveries array.
  this.config.actionMailer.deliveryMethod = "test";

  // Set host to be used by links generated in mailer templates.
  this.config.actionMailer.defaultUrlOptions = { host: "example.com" };

`
      }  // Print deprecation notices to the stderr.
  this.config.activeSupport.deprecation = "stderr";

  // Raises error for missing translations.
  // this.config.i18n.raiseOnMissingTranslations = true;

  // Annotate rendered view with file names.
  // this.config.actionView.annotateRenderedViewWithFilenames = true;

  // Raise error when a before_action's only/except options reference missing actions.
  this.config.actionController.raiseOnMissingCallbackActions = true;
});
`,
    );

    await this.createFile(
      "config/environments/production.ts",
      `import { TaggedLogging } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // Code is not reloaded between requests.
  this.config.enableReloading = false;

  // Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  this.config.eagerLoad = true;

  // Full error reports are disabled.
  this.config.considerAllRequestsLocal = false;
${
  this.options.api
    ? ""
    : `
  // Turn on fragment caching in view templates.
  this.config.actionController.performCaching = true;
`
}
  // Cache assets for far-future expiry since they are all digest stamped.
  this.config.publicFileServer.headers = { "cache-control": "public, max-age=31556952" };

  // Enable serving of images, stylesheets, and JavaScripts from an asset server.
  // this.config.assetHost = "http://assets.example.com";

${
  this.skipActiveStorage()
    ? ""
    : `  // Store uploaded files on the local file system (see config/storage.ts for options).
  this.config.activeStorage.service = "local";

`
}  // Assume all access to the app is happening through a SSL-terminating reverse proxy.
  this.config.assumeSsl = true;

  // Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  this.config.forceSsl = true;

  // Skip http-to-https redirect for the default health check endpoint.
  // this.config.sslOptions = { redirect: { exclude: (request) => request.path === "/up" } };

  // Log to STDOUT with the current request id as a default log tag.
  this.config.logTags = [":request_id"];
  this.config.logger = TaggedLogging.logger(process.stdout);

  // Change to "debug" to log everything (including potentially personally-identifiable information!)
  this.config.logLevel = process.env.TRAILS_LOG_LEVEL ?? "info";

  // Prevent health checks from clogging up the logs.
  this.config.silenceHealthcheckPath = "/up";

  // Don't log any deprecations.
  this.config.activeSupport.reportDeprecations = false;

${
  this.options.skipActiveJob
    ? ""
    : `  // Replace the default in-process and non-durable queuing backend for Active Job.
  // this.config.activeJob.queueAdapter = "resque";

`
}${
        this.skipActionMailer()
          ? ""
          : `  // Ignore bad email addresses and do not raise email delivery errors.
  // Set this to true and configure the email server for immediate delivery to raise delivery errors.
  // this.config.actionMailer.raiseDeliveryErrors = false;

  // Set host to be used by links generated in mailer templates.
  this.config.actionMailer.defaultUrlOptions = { host: "example.com" };

  // Specify outgoing SMTP server. Remember to add smtp/* credentials via trails credentials:edit.
  // this.config.actionMailer.smtpSettings = {
  //   userName: Trails.application.credentials.dig("smtp", "user_name"),
  //   password: Trails.application.credentials.dig("smtp", "password"),
  //   address: "smtp.example.com",
  //   port: 587,
  //   authentication: "plain",
  // };

`
      }  // Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  // the I18n.defaultLocale when a translation cannot be found).
  this.config.i18n.fallbacks = true;
${
  this.skipActiveRecord()
    ? ""
    : `
  // Do not dump schema after migrations.
  this.config.activeRecord.dumpSchemaAfterMigration = false;

  // Only use "id" for inspections in production.
  this.config.activeRecord.attributesForInspect = ["id"];
`
}
  // Enable DNS rebinding protection and other \`Host\` header attacks.
  // this.config.hosts = [
  //   "example.com",     // Allow requests from example.com
  //   /.*\\.example\\.com/, // Allow requests from subdomains like \`www.example.com\`
  // ];
  //
  // Skip DNS rebinding protection for the default health check endpoint.
  // this.config.hostAuthorization = { exclude: (request) => request.path === "/up" };
});
`,
    );

    await this.createFile(
      "config/initializers/content-security-policy.ts",
      `// Define an application-wide content security policy.
// See the Securing Rails Guide for more information:
// https://github.com/blazetrailsdev/blazetrails

// export default {
//   defaultSrc: ["'self'"],
//   fontSrc:    ["'self'", "https:", "data:"],
//   imgSrc:     ["'self'", "https:", "data:"],
//   objectSrc:  ["'none'"],
//   scriptSrc:  ["'self'"],
//   styleSrc:   ["'self'", "https:"],
// };
`,
    );

    await this.createFile(
      "config/initializers/cors.ts",
      `// Be sure to restart your server when you modify this file.

// Avoid CORS issues when API is called from the frontend app.
// Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

// Read more: https://github.com/cyu/rack-cors

// Trails.application.config.middleware.insertBefore(0, Rack.Cors, function () {
//   this.allow(function () {
//     this.origins("example.com");
//
//     this.resource("*", {
//       headers: "any",
//       methods: ["get", "post", "put", "patch", "delete", "options", "head"],
//     });
//   });
// });
`,
    );

    await this.createFile(
      "config/initializers/filter-parameter-logging.ts",
      `// Be sure to restart your server when you modify this file.

import { Trails } from "@blazetrails/trailties";

// Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
// Use this to limit dissemination of sensitive information.
// See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Trails.application.config.filterParameters = Trails.application.config.filterParameters.concat([
  "passw", "email", "secret", "token", "_key", "crypt", "salt", "certificate", "otp", "ssn", "cvv", "cvc",
]);
`,
    );

    await this.createFile(
      "config/initializers/inflections.ts",
      `// Add new inflection rules using the following format:
//
// import { Inflector } from "@blazetrails/activesupport";
//
// Inflector.inflections((inflect) => {
//   inflect.plural(/^(ox)$/i, "$1en");
//   inflect.singular(/^(ox)en/i, "$1");
//   inflect.irregular("person", "people");
//   inflect.uncountable("fish", "sheep");
// });
`,
    );

    await this.createFile(
      "config/initializers/permissions-policy.ts",
      `// Define an application-wide HTTP permissions policy.
//
// export default {
//   camera:      [],
//   gyroscope:   [],
//   microphone:  [],
//   usb:         [],
//   fullscreen:  ["self"],
//   payment:     ["self"],
// };
`,
    );

    await this.createFile(
      `config/initializers/new-framework-defaults-${VERSION.MAJOR}-${VERSION.MINOR}.ts`,
      `// Be sure to restart your server when you modify this file.
//
// This file eases your Trails ${VERSION.MAJOR}.${VERSION.MINOR} framework defaults upgrade.
//
// Uncomment each configuration one by one to switch to the new default.
// Once your application is ready to run with all new defaults, you can remove
// this file and set the \`config.loadDefaults\` to \`${VERSION.MAJOR}.${VERSION.MINOR}\`.

import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  ///
  // Specifies whether \`toTime\` methods preserve the UTC offset of their receivers or preserves the timezone.
  // If set to \`":zone"\`, \`toTime\` methods will use the timezone of their receivers.
  // If set to \`":offset"\`, \`toTime\` methods will use the UTC offset.
  // If \`false\`, \`toTime\` methods will convert to the local system UTC offset instead.
  //++
  // this.config.activeSupport.toTimePreservesTimezone = ":zone";

  ///
  // When both \`If-Modified-Since\` and \`If-None-Match\` are provided by the client
  // only consider \`If-None-Match\` as specified by RFC 7232 Section 6.
  // If set to \`false\` both conditions need to be satisfied.
  //++
  // this.config.actionDispatch.strictFreshness = true;
});
`,
    );

    if (!this.options.update) {
      await this.createFile(
        "config/locales/en.json",
        JSON.stringify(
          {
            en: {
              hello: "Hello world",
            },
          },
          null,
          2,
        ) + "\n",
      );
    }
  }

  /**
   * @missingRailsArgs template — PERMANENT
   * @missingRailsArgs remove_file — PERMANENT
   */
  async configWhenUpdating(): Promise<void> {
    const root = this.destinationRoot;
    const actionCableConfigExist = await File.isExistAsync(File.join(root, "config/cable.ts"));
    const activeStorageConfigExist = await File.isExistAsync(File.join(root, "config/storage.ts"));
    const rackCorsConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/cors.ts"),
    );
    const assetsConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/assets.ts"),
    );
    const assetAppStylesheetExist = await File.isExistAsync(
      File.join(root, "app/assets/stylesheets/application.css"),
    );
    const cspConfigExist = await File.isExistAsync(
      File.join(root, "config/initializers/content-security-policy.ts"),
    );

    this._configTargetVersion = String(Trails.application!.config.loadedConfigVersion ?? "5.0");

    await this.config();

    if (!this.options.skipActionCable && !actionCableConfigExist) {
      await this.template("config/cable.ts");
    }

    if (!this.skipActiveStorage() && !activeStorageConfigExist) {
      await this.template("config/storage.ts");
    }

    if (this.skipAssetPipeline() && !assetsConfigExist) {
      await this.removeFile("config/initializers/assets.ts");
    }

    if (this.skipAssetPipeline() && !assetAppStylesheetExist) {
      await this.removeFile("app/assets/stylesheets/application.css");
    }

    if (!rackCorsConfigExist) {
      await this.removeFile("config/initializers/cors.ts");
    }

    if (this.options.api) {
      if (!cspConfigExist) {
        await this.removeFile("config/initializers/content-security-policy.ts");
      }
    }
  }

  /** @missingRailsArgs template — PERMANENT */
  async databaseYml(): Promise<void> {
    await this.template(this.database.template, "config/database.ts");
  }

  async db(): Promise<void> {
    await this.directory("db");
  }

  async lib(): Promise<void> {
    await this.emptyDirectory("lib");
    await this.emptyDirectoryWithKeepFile("lib/tasks");
  }

  async log(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("log");
  }

  /** @missingRailsCall directory — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async publicDirectory(): Promise<void> {
    await this.createFile(
      "public/404.html",
      `<!DOCTYPE html>
<html>
<head>
  <title>The page you were looking for doesn't exist (404)</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background-color: #EFEFEF;
      color: #2E2F30;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 80px 20px;
    }
    div.dialog {
      width: 95%;
      max-width: 33em;
      margin: 0 auto;
    }
    h1 { font-size: 2em; line-height: 1.25; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <div class="dialog">
    <h1>The page you were looking for doesn't exist.</h1>
    <p>You may have mistyped the address or the page may have moved.</p>
  </div>
</body>
</html>
`,
    );

    await this.createFile(
      "public/422.html",
      `<!DOCTYPE html>
<html>
<head>
  <title>The change you wanted was rejected (422)</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background-color: #EFEFEF;
      color: #2E2F30;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 80px 20px;
    }
    div.dialog {
      width: 95%;
      max-width: 33em;
      margin: 0 auto;
    }
    h1 { font-size: 2em; line-height: 1.25; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <div class="dialog">
    <h1>The change you wanted was rejected.</h1>
    <p>Maybe you tried to change something you didn't have access to.</p>
  </div>
</body>
</html>
`,
    );

    await this.createFile(
      "public/500.html",
      `<!DOCTYPE html>
<html>
<head>
  <title>We're sorry, but something went wrong (500)</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      background-color: #EFEFEF;
      color: #2E2F30;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 80px 20px;
    }
    div.dialog {
      width: 95%;
      max-width: 33em;
      margin: 0 auto;
    }
    h1 { font-size: 2em; line-height: 1.25; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <div class="dialog">
    <h1>We're sorry, but something went wrong.</h1>
  </div>
</body>
</html>
`,
    );

    await this.createFile(
      "public/robots.txt",
      `# See https://www.robotstxt.org/robotstxt.html for documentation on how to use the robots.txt file
`,
    );

    await this.createFile("public/favicon.ico", "");
  }

  async storage(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("storage");
    await this.emptyDirectoryWithKeepFile("tmp/storage");
  }

  /** @missingRailsCall template — CONVERGEABLE app-builder-remaining-bodies-use-rails-file-actions */
  async test(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("test/fixtures/files");
    await this.emptyDirectoryWithKeepFile("test/controllers");
    await this.emptyDirectoryWithKeepFile("test/mailers");
    await this.emptyDirectoryWithKeepFile("test/models");
    await this.emptyDirectoryWithKeepFile("test/helpers");
    await this.emptyDirectoryWithKeepFile("test/integration");

    await this.createFile(
      "test/test-helper.ts",
      `import { TestCase } from "@blazetrails/activesupport/test-case";
import { env, setEnv } from "@blazetrails/ruby-compat";

if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
await import("../config/environment.ts");
await import("@blazetrails/trailties/test-help");

// Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
TestCase.fixtures(":all");

// Add more helper methods to be used by all tests here...
`,
    );

    await this.createFile(
      "test/global-setup.ts",
      `import { Base } from "@blazetrails/activerecord";
import { env, setEnv } from "@blazetrails/ruby-compat";

export async function setup(): Promise<void> {
  if (env.TRAILS_ENV == null) setEnv("TRAILS_ENV", "test");
  await import("../config/environment.ts");
  await import("@blazetrails/trailties/testing/maintain-test-schema");
}

export async function teardown(): Promise<void> {
  await Base.connectionHandler.clearAllConnectionsBang("all");
}
`,
    );
  }

  /** @missingRailsArgs template — PERMANENT */
  async systemTest(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("test/system");

    await this.template("test/application-system-test-case.ts");
  }

  async tmp(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("tmp");
    await this.emptyDirectoryWithKeepFile("tmp/pids");
  }

  async vendor(): Promise<void> {
    await this.emptyDirectoryWithKeepFile("vendor");
  }

  configTargetVersion(): string {
    return this._configTargetVersion ?? LOAD_DEFAULTS_VERSION;
  }
}

export class AppGenerator extends AppBase {
  readonly packageManager: PackageManager;
  readonly sqliteDriver: SqliteDriver;

  static override OPTION_IMPLICATIONS: Record<string, readonly string[]> = {
    ...AppBase.OPTION_IMPLICATIONS,
    skipGit: ["skipDecryptedDiffs"],
    minimal: [
      "skipActionCable",
      "skipActionMailbox",
      "skipActionMailer",
      "skipActionText",
      "skipActiveJob",
      "skipActiveStorage",
      "skipBootsnap",
      "skipBrakeman",
      "skipCi",
      "skipDevGems",
      "skipDocker",
      "skipHotwire",
      "skipJavascript",
      "skipJbuilder",
      "skipKamal",
      "skipEslint",
      "skipSolid",
      "skipSystemTest",
      "skipThruster",
    ],
    api: ["skipAssetPipeline", "skipJavascript"],
  };

  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.addSharedOptionsFor("application");
    this.classOption("version", {
      type: "boolean",
      aliases: "-v",
      group: "trails",
      desc: "Show Trails version number and quit",
    });
    this.classOption("api", {
      type: "boolean",
      desc: "Preconfigure smaller stack for API only apps",
    });
    this.classOption("minimal", { type: "boolean", desc: "Preconfigure a minimal trails app" });
    this.classOption("javascript", {
      type: "string",
      aliases: ["-j", "--js"],
      default: "importmap",
      enum: JAVASCRIPT_OPTIONS,
      desc: "Choose JavaScript approach",
    });
    this.classOption("css", {
      type: "string",
      aliases: "-c",
      enum: CSS_OPTIONS,
      desc: "Choose CSS processor. Check https://github.com/rails/cssbundling-rails for more options",
    });
    this.classOption("skipInstall", {
      type: "boolean",
      aliases: "-B",
      default: null,
      desc: "Don't install dependencies",
    });
    this.classOption("packageManager", {
      type: "string",
      enum: [...VALID_PACKAGE_MANAGERS],
      default: "pnpm",
      desc: "Package manager to use",
    });
    this.classOption("sqliteDriver", {
      type: "string",
      enum: [...VALID_SQLITE_DRIVERS],
      desc: "SQLite driver",
    });
    this.classOption("skipDecryptedDiffs", {
      type: "boolean",
      default: null,
      desc: "Don't configure git to show decrypted diffs of encrypted credentials",
    });
    this.publicCommand("reportImpliedOptions");
    this.methodAdded("setDefaultAccessorsBang");
    this.publicCommand("createRoot");
    this.methodAdded("createRootFiles");
    this.methodAdded("createAppFiles");
    this.methodAdded("createBinFiles");
    this.methodAdded("createDockerfiles");
    this.methodAdded("createEslintFile");
    this.methodAdded("createCifiles");
    this.methodAdded("createConfigFiles");
    this.methodAdded("updateConfigFiles");
    this.removeCommand("updateConfigFiles");
    this.methodAdded("createBootFile");
    this.methodAdded("createActiveRecordFiles");
    this.methodAdded("createDbFiles");
    this.methodAdded("createLibFiles");
    this.methodAdded("createLogFiles");
    this.methodAdded("createPublicFiles");
    this.methodAdded("createTmpFiles");
    this.methodAdded("createVendorFiles");
    this.methodAdded("createTestFiles");
    this.methodAdded("createSystemTestFiles");
    this.methodAdded("createStorageFiles");
    this.methodAdded("deleteAppAssetsIfApiOption");
    this.methodAdded("deleteAppHelpersIfApiOption");
    this.methodAdded("deleteAppViewsIfApiOption");
    this.methodAdded("deletePublicFilesIfApiOption");
    this.methodAdded("deleteActionMailerFilesSkippingActionMailer");
    this.methodAdded("deleteNonApiInitializersIfApiOption");
    this.methodAdded("deleteApiInitializers");
    this.methodAdded("deleteNewFrameworkDefaults");
    this.methodAdded("applyTrailsTemplate");
    this.publicCommand("runInstall");
  }

  declare options: AppGeneratorOptions & AppBaseOptions;

  static async applyTrailsTemplate(template: string, destination: string): Promise<AppGenerator> {
    const generator = new this(
      [destination],
      { template: template },
      { destinationRoot: destination },
    );
    generator.setDefaultAccessorsBang();
    await generator.applyTrailsTemplate();
    return generator;
  }

  static banner(): string {
    return `trails new ${(this as unknown as ThorClass)
      .arguments()
      .map((a) => a.usage())
      .join(" ")} [options]`;
  }

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    if (this.options.database)
      this.options.database = DB_ALIAS[this.options.database] ?? this.options.database;
    this.implyOptions(AppGenerator.OPTION_IMPLICATIONS, { metaOptions: META_OPTIONS });
    const options: AppBaseOptions = { ...UNPORTED_SUBSYSTEM_SKIP_DEFAULTS, ...this.options };
    const skipDependents = options.skipActiveStorage ? true : undefined;
    this.options = Object.freeze({
      skipActionMailbox: skipDependents,
      skipActionText: skipDependents,
      ...options,
    });
    this.packageManager = this.options.packageManager ?? "pnpm";
    this.sqliteDriver = this.options.sqliteDriver ?? "better-sqlite3";
    if (!VALID_PACKAGE_MANAGERS.includes(this.packageManager)) {
      throw new GeneratorError(
        `Unknown package manager '${this.packageManager}'. Valid options: ${VALID_PACKAGE_MANAGERS.join(", ")}`,
      );
    }
    if (!VALID_SQLITE_DRIVERS.includes(this.sqliteDriver)) {
      throw new GeneratorError(
        `Unknown SQLite driver '${this.sqliteDriver}'. Valid options: ${VALID_SQLITE_DRIVERS.join(", ")}`,
      );
    }
  }

  async createRootFiles(): Promise<void> {
    await this.build("readme");
    await this.build("rakefile");
    if (this.usingNode()) await this.build("nodeVersion");
    await this.build("rubyVersion");
    await this.build("configru");

    if (!this.options.skipGit) {
      await this.build("gitignore");
      await this.build("gitattributes");
    }

    await this.build("gemfile");
    await this.build("versionControl");
  }

  async createAppFiles(): Promise<void> {
    await this.build("app");
  }

  async createBinFiles(): Promise<void> {
    await this.build("bin");
  }

  async createDockerfiles(): Promise<void> {
    if (this.options.skipDocker || this.options.dummyApp) return;
    await this.build("dockerfiles");
  }

  async createEslintFile(): Promise<void> {
    if (this.skipEslint()) return;
    await this.build("eslint");
  }

  async createCifiles(): Promise<void> {
    if (this.skipCi()) return;
    await this.build("cifiles");
  }

  async createConfigFiles(): Promise<void> {
    await this.build("config");
  }

  async updateConfigFiles(): Promise<void> {
    await this.build("configWhenUpdating");
  }

  /** @missingRailsArgs template — PERMANENT */
  async createBootFile(): Promise<void> {
    await this.template("config/boot.ts", "config/boot.ts");
  }

  async createActiveRecordFiles(): Promise<void> {
    if (this.options.skipActiveRecord) return;
    await this.build("databaseYml");
  }

  async createDbFiles(): Promise<void> {
    if (this.options.skipActiveRecord) return;
    await this.build("db");
  }

  async createLibFiles(): Promise<void> {
    await this.build("lib");
  }

  async createLogFiles(): Promise<void> {
    await this.build("log");
  }

  async createPublicFiles(): Promise<void> {
    await this.build("publicDirectory");
  }

  async createTmpFiles(): Promise<void> {
    await this.build("tmp");
  }

  async createVendorFiles(): Promise<void> {
    await this.build("vendor");
  }

  async createTestFiles(): Promise<void> {
    if (!this.options.skipTest) await this.build("test");
  }

  async createSystemTestFiles(): Promise<void> {
    if (this.dependsOnSystemTest()) await this.build("systemTest");
  }

  async createStorageFiles(): Promise<void> {
    if (!this.skipStorage()) await this.build("storage");
  }

  async deleteAppAssetsIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeDir("app/assets");
    }
  }

  async deleteAppHelpersIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeDir("app/helpers");
      await this.removeDir("test/helpers");
    }
  }

  async deleteAppViewsIfApiOption(): Promise<void> {
    if (this.options.api) {
      if (this.options.skipActionMailer) {
        await this.removeDir("app/views");
      } else {
        await this.removeFile("app/views/layouts/application.html.tse");
        await this.removeDir("app/views/pwa");
      }
    }
  }

  async deletePublicFilesIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeFile("public/400.html");
      await this.removeFile("public/404.html");
      await this.removeFile("public/406-unsupported-browser.html");
      await this.removeFile("public/422.html");
      await this.removeFile("public/500.html");
      await this.removeFile("public/icon.png");
      await this.removeFile("public/icon.svg");
    }
  }

  async deleteActionMailerFilesSkippingActionMailer(): Promise<void> {
    if (this.options.skipActionMailer) {
      await this.removeFile("app/views/layouts/mailer.html.tse");
      await this.removeFile("app/views/layouts/mailer.text.tse");
      await this.removeDir("app/mailers");
      await this.removeDir("test/mailers");
    }
  }

  /** @missingRailsArgs remove_file — PERMANENT */
  async deleteNonApiInitializersIfApiOption(): Promise<void> {
    if (this.options.api) {
      await this.removeFile("config/initializers/content-security-policy.ts");
    }
  }

  async deleteApiInitializers(): Promise<void> {
    if (!this.options.api) {
      await this.removeFile("config/initializers/cors.ts");
    }
  }

  async deleteNewFrameworkDefaults(): Promise<void> {
    if (!this.options.update) {
      await this.removeFile(
        `config/initializers/new-framework-defaults-${VERSION.MAJOR}-${VERSION.MINOR}.ts`,
      );
    }
  }

  /** @internal */
  protected getBuilderClass(): new (generator: never) => object {
    return TopLevel.AppBuilder !== undefined ? TopLevel.AppBuilder : AppBuilder;
  }
}
