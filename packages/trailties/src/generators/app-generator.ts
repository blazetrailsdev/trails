import { camelize, parameterize, underscore } from "@blazetrails/activesupport";
import { ref, tsClass, tsField, tsModule, tsRaw } from "../template-builder/index.js";
import { AppBase, type AppBaseOptions } from "./app-base.js";
import { GeneratorError } from "./generated-attribute.js";
import { type DatabaseName } from "./database.js";

// Rails' `Rails::Generators::AppName::RESERVED_NAMES` (`app_name.rb:6`).
const RESERVED_NAMES = ["application", "destroy", "plugin", "runner", "test"];

// CLI-friendly DB aliases — `trails new -d sqlite|postgres|mysql` maps
// onto the canonical Rails `DatabaseName`. MariaDB is exposed via the
// canonical `mariadb-mysql` adapter id only (no short alias).
const DB_ALIAS: Record<string, DatabaseName> = {
  sqlite: "sqlite3",
  postgres: "postgresql",
};

export type AppDatabase = "sqlite" | "postgres" | "mysql" | DatabaseName;
export type PackageManager = "pnpm" | "npm" | "yarn";
export type SqliteDriver = "better-sqlite3" | "node-sqlite" | "expo-sqlite";

export const VALID_PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn"];
export const VALID_SQLITE_DRIVERS: readonly SqliteDriver[] = [
  "better-sqlite3",
  "node-sqlite",
  "expo-sqlite",
];

export interface AppGeneratorOptions extends Omit<AppBaseOptions, "database" | "appPath"> {
  appPath?: string;
  database?: AppDatabase;
  skipDocker?: boolean;
  packageManager?: PackageManager;
  sqliteDriver?: SqliteDriver;
}

/**
 * The one supported way a generated app invokes the trails CLI: through the
 * `tsx` loader, so a command that imports application code can resolve the
 * `.js` specifiers `Node16` resolution requires of a `.ts` source.
 *
 * @noRailsEquivalent PERMANENT
 */
const TRAILS_ARGV = ["tsx", "node_modules/@blazetrails/trailties/bin/trails.js"];
const TRAILS = TRAILS_ARGV.join(" ");

export class AppGenerator extends AppBase {
  readonly packageManager: PackageManager;
  readonly sqliteDriver: SqliteDriver;

  constructor(options: AppGeneratorOptions) {
    const database = options.database
      ? (DB_ALIAS[options.database] ?? options.database)
      : undefined;
    super({ ...options, appPath: options.appPath ?? options.cwd, database });
    this.packageManager = options.packageManager ?? "pnpm";
    this.sqliteDriver = options.sqliteDriver ?? "better-sqlite3";
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

  /** Rails' `AppName#original_app_name` (`app_name.rb:12`). Trails has no
   * `--name` option, so the `options[:name]` arm has nothing to read. */
  private originalAppName(): string {
    return this.path.basename(this.destinationRoot);
  }

  /** Rails' `AppName#app_name` (`app_name.rb:9`):
   * `original_app_name.parameterize(preserve_case: true).underscore`. */
  private appName(): string {
    return underscore(parameterize(this.originalAppName(), { preserveCase: true }));
  }

  /** Rails' `AppName#app_const_base` (`app_name.rb:18`):
   * `app_name.gsub(/\W/, "_").squeeze("_").camelize`. */
  private appConstBase(): string {
    return camelize(this.appName().replace(/\W/g, "_").replace(/_+/g, "_"));
  }

  /** Rails' `AppName#app_const` (`app_name.rb:22`) is
   * `"#{app_const_base}::Application"`. TypeScript has no module nesting, so
   * the generated class is `app_const_base` itself — which is what
   * `Application#name` dasherizes back into the Rails app name. */
  private appConst(): string {
    return this.appConstBase();
  }

  /** Rails' `AppName#valid_const?` (`app_name.rb:26`), called from
   * `AppBase#create_root` (`app_base.rb:258`). The third Rails arm,
   * `Object.const_defined?(app_const_base)`, has no counterpart: JavaScript
   * has no global constant table to probe. */
  private isValidConst(): void {
    if (/^\d/.test(this.appConst())) {
      throw new GeneratorError(
        `Invalid application name ${this.originalAppName()}. Please give a name which does not start with numbers.`,
      );
    } else if (RESERVED_NAMES.includes(this.originalAppName())) {
      throw new GeneratorError(
        `Invalid application name ${this.originalAppName()}. Please give a ` +
          `name which does not match one of the reserved trails ` +
          `words: ${RESERVED_NAMES.join(", ")}`,
      );
    }
  }

  /**
   * `npm run` / `pnpm` / `yarn` — the prefix a generated script is invoked
   * with. Rails has no analogue: `bin/rails` is executable because Ruby needs
   * no build step, while every trails CLI command that executes application
   * code has to enter through the `tsx` loader the scripts declare.
   *
   * @noRailsEquivalent PERMANENT
   */
  private pmRun(): string {
    return this.packageManager === "npm" ? "npm run" : this.packageManager;
  }

  private pmInstall(): string {
    return this.packageManager === "yarn" ? "yarn" : `${this.packageManager} install`;
  }

  private pmLockFile(): string {
    return this.packageManager === "pnpm"
      ? "pnpm-lock.yaml"
      : this.packageManager === "yarn"
        ? "yarn.lock"
        : "package-lock.json";
  }

  async run(): Promise<string[]> {
    this.isValidConst();
    const name = this.path.basename(this.appPath);

    this.output(`Creating new trails application: ${name}`);
    this.output("");

    this.createRootFiles(name);
    this.createBinFiles();
    this.createConfigFiles(name);
    this.createAppFiles(name);
    this.createDbFiles();
    this.createTestFiles();
    this.createPublicFiles();
    this.createDirectoryPlaceholders();

    if (!this.options.skipDocker) {
      this.createDockerFiles();
    }

    this.output("");

    return this.getCreatedFiles();
  }

  private createRootFiles(name: string): void {
    const dep = this.database.pkgDependency;
    // For sqlite3 the driver dep depends on the chosen driver: node-sqlite is
    // built into Node (no dep), expo-sqlite needs its own package, and
    // better-sqlite3 (the default) uses the database's pkgDependency. Other
    // databases always include their pkgDependency.
    const dbDep =
      this.database.name === "sqlite3" && this.sqliteDriver !== "better-sqlite3"
        ? this.sqliteDriver === "expo-sqlite"
          ? { "expo-sqlite": "^15.0.0" }
          : {}
        : { [dep.name]: dep.version };
    this.createFile(
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
            build: "tsc",
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
            "@blazetrails/activerecord": "*",
            "@blazetrails/activemodel": "*",
            "@blazetrails/activesupport": "*",
            "@blazetrails/rack": "*",
            "@blazetrails/actionpack": "*",
            "@blazetrails/actionview": "*",
            "@blazetrails/trailties": "*",
            ...dbDep,
          },
          devDependencies: {
            "@blazetrails/trails-tsc": "*",
            tsx: "^4.20.0",
            typescript: "^5.7.0",
            vite: "^7.0.0",
            vitest: "^3.0.0",
          },
        },
        null,
        2,
      ) + "\n",
    );

    this.createFile(
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
            rootDir: ".",
            outDir: "dist",
            plugins: [{ name: "@blazetrails/trails-tsc/ts-plugin", viewsDir: "app/views" }],
          },
          include: ["app", "config", "db", ".trails/template-registry-augmentation.d.ts"],
        },
        null,
        2,
      ) + "\n",
    );

    this.createFile(
      ".gitignore",
      `/node_modules/
/dist/
/.trails/
/.env*
!/.env.example

/db/*.sqlite3
/db/*.sqlite3-*

/log/*
!/log/.gitkeep

/tmp/*
!/tmp/.gitkeep
!/tmp/pids/
/tmp/pids/*
!/tmp/pids/.gitkeep

/storage/*
!/storage/.gitkeep

/public/assets/

*.tsbuildinfo
`,
    );

    this.createFile(
      ".gitattributes",
      `# Mark the database schema as having been generated.
db/schema.ts linguist-generated

*.ts diff=typescript
`,
    );

    this.createFile(".node-version", "24.16.0\n");

    this.createFile(
      "README.md",
      `# ${name}

This application was generated with [trails](https://github.com/blazetrailsdev/blazetrails).

## Getting started

    cd ${name}
    ${this.pmInstall()}
    ${this.pmRun()} db:setup
    ${this.pmRun()} dev

Every command below that executes application code — anything that imports a
model, \`config/database.ts\`, or \`config/routes.ts\` — must run through the
\`tsx\` loader, because the app's sources are TypeScript and \`Node16\`
resolution spells its imports with a \`.js\` extension that has no file behind
it until the loader transforms them. The generated \`package.json\` scripts and
the \`bin/\` binstubs already do this, so every command below is loader-backed.
To reach a CLI command with no script of its own, use the \`bin/trails\`
binstub:

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
`,
    );

    this.createFile(
      "config.ts",
      `// This file is used by Rack-based servers to start the application.
import { Trails } from "@blazetrails/trailties";

import "./config/environment.js";

export default Trails.application;
`,
    );

    this.createFile(
      "vite.config.ts",
      `import { defineConfig } from "vite";

export default defineConfig({
  root: "app/assets",
  base: "/assets/",
  publicDir: "../../public",
  build: {
    outDir: "../../public/assets",
    manifest: true,
    rollupOptions: {
      input: {
        application: "stylesheets/application.css",
      },
    },
  },
});
`,
    );
  }

  private createBinFiles(): void {
    this.createFile(
      "bin/trails",
      `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const { status } = spawnSync(
  "${TRAILS_ARGV[0]}",
  ["${TRAILS_ARGV[1]}", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(status ?? 1);
`,
      { mode: 0o755 },
    );

    this.createFile(
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
      { mode: 0o755 },
    );

    this.createFile(
      "bin/dev",
      `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const { status } = spawnSync("bin/trails", ["server", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(status ?? 1);
`,
      { mode: 0o755 },
    );
  }

  private createConfigFiles(name: string): void {
    this.createFile(
      "config/application.ts",
      `import { Application } from "@blazetrails/trailties";

export class ${this.appConstBase()} extends Application {
  // Configuration for the application, engines, and trailties goes here.
  //
  // These settings can be overridden in specific environments using the files
  // in config/environments, which are processed later.
  //
  // config.timeZone = "Central Time (US & Canada)";
  // config.eagerLoadPaths.push("extras");
  // config
}

Application.register(${this.appConstBase()});
`,
    );

    this.createFile(
      "config/environment.ts",
      `import { Trails } from "@blazetrails/trailties";

// Load the trails application.
import "./application.js";

// Initialize the trails application.
export default await Trails.initialize();
`,
    );

    this.createFile(
      "config/routes.ts",
      `import type { Mapper } from "@blazetrails/actionpack";

export function drawRoutes(mapper: Mapper): void {
  // Define your application routes here.
  // Example:
  //   mapper.get("/posts", { to: "posts#index" });

  // Defines the root path route ("/")
  // mapper.root("posts#index");
  // routes
}
`,
    );

    this.createFile("config/database.ts", this.dbConfig(name));

    if (!this.skip("ActionCable")) {
      this.createFile(
        "config/cable.ts",
        `export default {
  development: {
    adapter: "async",
  },
  test: {
    adapter: "test",
  },
  production: {
    adapter: "redis",
    url: process.env.REDIS_URL || "redis://localhost:6379/1",
  },
};
`,
      );
    }

    if (!this.skip("ActiveStorage")) {
      this.createFile(
        "config/storage.ts",
        `export default {
  local: {
    service: "Disk",
    root: "storage",
  },
  test: {
    service: "Disk",
    root: "tmp/storage",
  },
};
`,
      );
    }

    this.createFile(
      "config/environments/development.ts",
      `export default {
  cacheClasses: false,
  eagerLoad: false,
  considerAllRequestsLocal: true,
  serverTiming: true,
  cacheStore: "memory",
  // config
};
`,
    );

    this.createFile(
      "config/environments/test.ts",
      `export default {
  cacheClasses: true,
  eagerLoad: false,
  considerAllRequestsLocal: true,
  cacheStore: "null",
  // config
};
`,
    );

    this.createFile(
      "config/environments/production.ts",
      `export default {
  cacheClasses: true,
  eagerLoad: true,
  considerAllRequestsLocal: false,
  forceSSL: true,
  logLevel: "info",
  cacheStore: "memory",
  // config
};
`,
    );

    this.createFile(
      "config/initializers/content-security-policy.ts",
      `// Define an application-wide content security policy.
// See the Securing Trails Guide for more information:
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

    this.createFile(
      "config/initializers/filter-parameter-logging.ts",
      `// Configure parameters which will be filtered from the log file.
export const filterParameters = [
  "passw", "secret", "token", "_key", "crypt",
  "salt", "certificate", "otp", "ssn",
];
`,
    );

    this.createFile(
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

    this.createFile(
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

    this.createFile(
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

  private createAppFiles(name: string): void {
    this.createFile(
      "app/controllers/application-controller.ts",
      tsModule({
        imports: [{ from: "@blazetrails/actionpack", named: { ActionController: "named" } }],
        declarations: [
          tsClass({
            name: "ApplicationController",
            extends: ref("ActionController.Base"),
            body: [],
          }),
        ],
      }),
    );

    this.createFile("app/controllers/concerns/.gitkeep", "");

    this.createFile(
      "app/models/application-record.ts",
      tsModule({
        imports: [{ from: "@blazetrails/activerecord", named: { ActiveRecord: "named" } }],
        declarations: [
          tsClass({ name: "ApplicationRecord", extends: ref("ActiveRecord.Base"), body: [] }),
        ],
      }),
    );

    this.createFile("app/models/concerns/.gitkeep", "");

    this.createFile(
      "app/helpers/application-helper.ts",
      tsModule({ declarations: [tsRaw(`export const ApplicationHelper = {\n};`)] }),
    );

    if (!this.skip("ActiveJob")) {
      this.createFile(
        "app/jobs/application-job.ts",
        tsModule({
          declarations: [
            tsClass({
              name: "ApplicationJob",
              body: [tsField("queueAs", "string", { inferType: true, initializer: '"default"' })],
            }),
          ],
        }),
      );
    }

    if (!this.skip("ActionMailer")) {
      this.createFile(
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

    if (!this.skip("ActionCable")) {
      this.createFile(
        "app/channels/application-cable/connection.ts",
        tsModule({ declarations: [tsClass({ name: "Connection", body: [] })] }),
      );

      this.createFile(
        "app/channels/application-cable/channel.ts",
        tsModule({ declarations: [tsClass({ name: "Channel", body: [] })] }),
      );
    }

    this.createFile(
      "app/views/layouts/application.html.tse",
      `<!DOCTYPE html>
<html>
<head>
  <title>${name}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/assets/stylesheets/application.css">
</head>
<body>
  <%- yield %>
</body>
</html>
`,
    );

    if (!this.skip("ActionMailer")) {
      this.createFile(
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
  <%- yield %>
</body>
</html>
`,
      );

      this.createFile(
        "app/views/layouts/mailer.text.tse",
        `<%- yield %>
`,
      );
    }

    this.createFile(
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

    this.createFile("app/assets/images/.gitkeep", "");
  }

  private createDbFiles(): void {
    this.createFile("db/migrate/.gitkeep", "");

    this.createFile(
      "db/seeds.ts",
      `// Seed your database here.
// Example:
//   import { User } from "../app/models/user.js";
//   await User.create({ name: "Admin", email: "admin@example.com" });
`,
    );

    this.createFile(
      "db/schema.ts",
      `// This file is auto-generated from the current state of the database.
// Instead of editing this file, use migrations to change your schema.
`,
    );
  }

  private createTestFiles(): void {
    this.createFile(
      "test/test-helper.ts",
      `// Test helper — loaded before all test files.
import { ActiveRecord } from "@blazetrails/activerecord";

export async function setupTestDatabase(): Promise<void> {
  // Configure test database connection
}
`,
    );

    this.createFile("test/models/.gitkeep", "");
    this.createFile("test/controllers/.gitkeep", "");
    this.createFile("test/helpers/.gitkeep", "");
    this.createFile("test/integration/.gitkeep", "");
    this.createFile("test/fixtures/files/.gitkeep", "");
  }

  private createPublicFiles(): void {
    this.createFile(
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

    this.createFile(
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

    this.createFile(
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

    this.createFile(
      "public/robots.txt",
      `# See https://www.robotstxt.org/robotstxt.html for documentation on how to use the robots.txt file
`,
    );

    this.createFile("public/favicon.ico", "");
  }

  private createDirectoryPlaceholders(): void {
    this.createFile("lib/tasks/.gitkeep", "");
    this.createFile("log/.gitkeep", "");
    if (!this.skip("ActiveStorage")) {
      this.createFile("storage/.gitkeep", "");
    }
    this.createFile("tmp/.gitkeep", "");
    this.createFile("tmp/pids/.gitkeep", "");
    this.createFile("vendor/.gitkeep", "");
  }

  private createDockerFiles(): void {
    this.createFile(
      "Dockerfile",
      `# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.16.0
FROM node:${"${NODE_VERSION}"}-slim AS base

LABEL fly_launch_runtime="Trails"

WORKDIR /app

ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json ${this.pmLockFile()}* ./
RUN ${this.packageManager === "pnpm" ? "corepack enable pnpm && pnpm install" : this.packageManager === "yarn" ? "corepack enable yarn && yarn" : this.pmInstall()}

COPY . .
RUN ${this.packageManager === "pnpm" ? "pnpm" : this.packageManager} run build

FROM base

COPY --from=build /app /app

EXPOSE 3000
CMD ["npx", "trails", "server"]
`,
    );

    this.createFile(
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

  private dbConfig(appName: string): string {
    switch (this.database.name) {
      case "postgres":
        return `export default {
  development: {
    adapter: "postgresql",
    database: "${appName}_development",
    host: "localhost",
    port: 5432,
  },
  test: {
    adapter: "postgresql",
    database: "${appName}_test",
    host: "localhost",
    port: 5432,
  },
  production: {
    adapter: "postgresql",
    url: process.env.DATABASE_URL,
  },
};
`;
      case "mysql":
      case "mariadb":
        return `export default {
  development: {
    adapter: "mysql2",
    database: "${appName}_development",
    host: "localhost",
    port: 3306,
  },
  test: {
    adapter: "mysql2",
    database: "${appName}_test",
    host: "localhost",
    port: 3306,
  },
  production: {
    adapter: "mysql2",
    url: process.env.DATABASE_URL,
  },
};
`;
      default: {
        // Each SQLite driver maps to its own registered adapter name; the
        // adapter subclass bundles its driver, so no side-effect import is
        // needed. better-sqlite3 backs the canonical `sqlite3` name.
        const adapter = this.sqliteDriver === "better-sqlite3" ? "sqlite3" : this.sqliteDriver;
        return `export default {
  development: {
    adapter: "${adapter}",
    database: "db/development.sqlite3",
  },
  test: {
    adapter: "${adapter}",
    database: "db/test.sqlite3",
  },
  production: {
    adapter: "${adapter}",
    database: "db/production.sqlite3",
  },
};
`;
      }
    }
  }
}
