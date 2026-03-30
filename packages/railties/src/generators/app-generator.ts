import * as path from "node:path";
import { execSync } from "node:child_process";
import { GeneratorBase, GeneratorOptions } from "./base.js";

export interface AppOptions {
  database: "sqlite" | "postgres" | "mysql";
  skipGit?: boolean;
  skipInstall?: boolean;
  skipDocker?: boolean;
}

export class AppGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  async run(name: string, options: AppOptions): Promise<string[]> {
    const appDir = path.join(this.cwd, name);
    this.cwd = appDir;

    this.output(`Creating new trails application: ${name}`);
    this.output("");

    this.createRootFiles(name, options);
    this.createBinFiles(name);
    this.createConfigFiles(name, options);
    this.createAppFiles(name);
    this.createDbFiles(name);
    this.createTestFiles();
    this.createPublicFiles(name);
    this.createDirectoryPlaceholders();

    if (!options.skipDocker) {
      this.createDockerFiles(name);
    }

    this.output("");

    if (!options.skipGit) {
      try {
        execSync("git init", { cwd: appDir, stdio: "pipe" });
        this.output("  Initialized git repository");
      } catch {
        // git not available
      }
    }

    if (!options.skipInstall) {
      this.output("  Installing dependencies...");
      try {
        execSync("pnpm install", { cwd: appDir, stdio: "pipe" });
        this.output("  Dependencies installed");
      } catch {
        this.output("  Could not install dependencies — run 'pnpm install' manually");
      }
    }

    this.output("");
    this.output(`  Done! cd ${name} && trails server`);

    return this.getCreatedFiles();
  }

  private createRootFiles(name: string, options: AppOptions): void {
    // package.json
    this.createFile(
      "package.json",
      JSON.stringify(
        {
          name,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            build: "tsc",
            test: "vitest run",
            dev: "trails server",
            "db:create": "trails db create",
            "db:migrate": "trails db migrate",
            "db:seed": "trails db seed",
            "db:setup": "trails db create && trails db migrate && trails db seed",
            "db:reset": "trails db drop && trails db setup",
          },
          dependencies: {
            "@blazetrails/activerecord": "*",
            "@blazetrails/activemodel": "*",
            "@blazetrails/activesupport": "*",
            "@blazetrails/rack": "*",
            "@blazetrails/actionpack": "*",
            "@blazetrails/railties": "*",
            ...this.dbDependency(options.database),
          },
          devDependencies: {
            typescript: "^5.7.0",
            vite: "^7.0.0",
            vitest: "^3.0.0",
          },
        },
        null,
        2,
      ) + "\n",
    );

    // tsconfig.json
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
            outDir: "dist",
            rootDir: "src",
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
          },
          include: ["src"],
        },
        null,
        2,
      ) + "\n",
    );

    // .gitignore
    this.createFile(
      ".gitignore",
      `/node_modules/
/dist/
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

    // .gitattributes
    this.createFile(
      ".gitattributes",
      `# Mark the database schema as having been generated.
db/schema.ts linguist-generated

*.ts diff=typescript
`,
    );

    // .node-version
    this.createFile(".node-version", "22.0.0\n");

    // README.md
    this.createFile(
      "README.md",
      `# ${name}

This application was generated with [trails](https://github.com/blazetrailsdev/blazetrails).

## Getting started

    cd ${name}
    pnpm install
    trails db setup
    trails server

## Commands

| Command | Description |
| --- | --- |
| \`trails server\` | Start the development server |
| \`trails generate model NAME\` | Generate a new model |
| \`trails generate controller NAME\` | Generate a new controller |
| \`trails generate scaffold NAME\` | Generate a full CRUD resource |
| \`trails db migrate\` | Run pending database migrations |
| \`trails db seed\` | Seed the database |
| \`trails test\` | Run the test suite |

## Configuration

- Database: \`src/config/database.ts\`
- Routes: \`src/config/routes.ts\`
- Environment-specific: \`src/config/environments/\`
`,
    );

    // config.ts — equivalent to config.ru (rackup file)
    this.createFile(
      "config.ts",
      `import { app } from "./src/config/application.js";

export default app;
`,
    );

    // vite.config.ts — Vite dev server with trails Rack adapter
    this.createFile(
      "vite.config.ts",
      `import { defineConfig } from "vite";
import { trailsPlugin } from "@blazetrails/railties/vite";

export default defineConfig({
  plugins: [trailsPlugin()],
  root: "src/app/assets",
  base: "/assets/",
  publicDir: "../../../public",
  build: {
    outDir: "../../../public/assets",
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

  private createBinFiles(name: string): void {
    // bin/trails — binstub
    this.createFile(
      "bin/trails",
      `#!/usr/bin/env node
import { createProgram } from "@blazetrails/railties";

const program = createProgram();
program.parse(process.argv);
`,
      { mode: 0o755 },
    );

    // bin/setup
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
system("pnpm install");

console.log("\\n== Preparing database ==");
system("trails db setup");

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

    // bin/dev
    this.createFile(
      "bin/dev",
      `#!/usr/bin/env node
import { execSync } from "node:child_process";

execSync("trails server", { stdio: "inherit" });
`,
      { mode: 0o755 },
    );
  }

  private createConfigFiles(name: string, options: AppOptions): void {
    // src/config/application.ts — equivalent to config/application.rb
    this.createFile(
      "src/config/application.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";
import { ActiveSupport } from "@blazetrails/activesupport";
import databaseConfig from "./database.js";
import { drawRoutes } from "./routes.js";

export const app = {
  name: "${name}",
  config: {
    database: databaseConfig,
  },
  routes: drawRoutes,
};
`,
    );

    // src/config/environment.ts — equivalent to config/environment.rb
    this.createFile(
      "src/config/environment.ts",
      `import { app } from "./application.js";

export default app;
`,
    );

    // src/config/routes.ts
    this.createFile(
      "src/config/routes.ts",
      `// Define your application routes here.
// Example:
//   router.resources("posts");
//   router.get("/", "home#index");

export function drawRoutes(router: any): void {
  // routes
}
`,
    );

    // src/config/database.ts
    this.createFile("src/config/database.ts", this.dbConfig(name, options.database));

    // src/config/puma.ts — equivalent to config/puma.rb
    this.createFile(
      "src/config/puma.ts",
      `const port = parseInt(process.env.PORT || "3000", 10);
const environment = process.env.NODE_ENV || "development";

export default {
  port,
  environment,
  pidfile: "tmp/pids/server.pid",
  workers: parseInt(process.env.WEB_CONCURRENCY || "0", 10),
  maxThreads: parseInt(process.env.TRAILS_MAX_THREADS || "5", 10),
  minThreads: parseInt(process.env.TRAILS_MIN_THREADS || "5", 10),
};
`,
    );

    // src/config/cable.ts — equivalent to config/cable.yml
    this.createFile(
      "src/config/cable.ts",
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

    // src/config/storage.ts — equivalent to config/storage.yml
    this.createFile(
      "src/config/storage.ts",
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

    // Environment configs
    this.createFile(
      "src/config/environments/development.ts",
      `export default {
  cacheClasses: false,
  eagerLoad: false,
  considerAllRequestsLocal: true,
  serverTiming: true,
  cacheStore: "memory",
};
`,
    );

    this.createFile(
      "src/config/environments/test.ts",
      `export default {
  cacheClasses: true,
  eagerLoad: false,
  considerAllRequestsLocal: true,
  cacheStore: "null",
};
`,
    );

    this.createFile(
      "src/config/environments/production.ts",
      `export default {
  cacheClasses: true,
  eagerLoad: true,
  considerAllRequestsLocal: false,
  forceSSL: true,
  logLevel: "info",
  cacheStore: "memory",
};
`,
    );

    // Initializers
    this.createFile(
      "src/config/initializers/content-security-policy.ts",
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
      "src/config/initializers/filter-parameter-logging.ts",
      `// Configure parameters which will be filtered from the log file.
export const filterParameters = [
  "passw", "secret", "token", "_key", "crypt",
  "salt", "certificate", "otp", "ssn",
];
`,
    );

    this.createFile(
      "src/config/initializers/inflections.ts",
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
      "src/config/initializers/permissions-policy.ts",
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

    // Locales
    this.createFile(
      "src/config/locales/en.json",
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
    // Application controller
    this.createFile(
      "src/app/controllers/application-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";

export class ApplicationController extends ActionController.Base {
}
`,
    );

    this.createFile("src/app/controllers/concerns/.gitkeep", "");

    // Application record — equivalent to application_record.rb
    this.createFile(
      "src/app/models/application-record.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";

export class ApplicationRecord extends ActiveRecord.Base {
}
`,
    );

    this.createFile("src/app/models/concerns/.gitkeep", "");

    // Application helper
    this.createFile(
      "src/app/helpers/application-helper.ts",
      `export const ApplicationHelper = {
};
`,
    );

    // Application job — equivalent to application_job.rb
    this.createFile(
      "src/app/jobs/application-job.ts",
      `export class ApplicationJob {
  queueAs = "default";
}
`,
    );

    // Application mailer — equivalent to application_mailer.rb
    this.createFile(
      "src/app/mailers/application-mailer.ts",
      `export class ApplicationMailer {
  defaultFrom = "from@example.com";
  layout = "mailer";
}
`,
    );

    // Channels
    this.createFile(
      "src/app/channels/application-cable/connection.ts",
      `export class Connection {
}
`,
    );

    this.createFile(
      "src/app/channels/application-cable/channel.ts",
      `export class Channel {
}
`,
    );

    // Views — layouts
    this.createFile(
      "src/app/views/layouts/application.html.ejs",
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

    this.createFile(
      "src/app/views/layouts/mailer.html.ejs",
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
      "src/app/views/layouts/mailer.text.ejs",
      `<%- yield %>
`,
    );

    // Assets
    this.createFile(
      "src/app/assets/stylesheets/application.css",
      `/*
 * This is a manifest file that'll be compiled into application.css,
 * which will include all the files listed below.
 *
 * Any CSS (and SCSS, if configured) file within src/app/assets/stylesheets
 * or any plugin's vendor/assets/stylesheets directory can be referenced here.
 */
`,
    );

    this.createFile("src/app/assets/images/.gitkeep", "");
  }

  private createDbFiles(name: string): void {
    this.createFile("db/migrations/.gitkeep", "");

    this.createFile(
      "db/seeds.ts",
      `// Seed your database here.
// Example:
//   import { User } from "../src/app/models/user.js";
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

  private createPublicFiles(name: string): void {
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
    this.createFile("storage/.gitkeep", "");
    this.createFile("tmp/.gitkeep", "");
    this.createFile("tmp/pids/.gitkeep", "");
    this.createFile("vendor/.gitkeep", "");
  }

  private createDockerFiles(name: string): void {
    this.createFile(
      "Dockerfile",
      `# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.0.0
FROM node:${"${NODE_VERSION}"}-slim AS base

LABEL fly_launch_runtime="Trails"

WORKDIR /app

ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install

COPY . .
RUN pnpm run build

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

  private dbDependency(db: string): Record<string, string> {
    switch (db) {
      case "postgres":
        return { pg: "^8.19.0" };
      case "mysql":
        return { mysql2: "^3.18.0" };
      case "sqlite":
      default:
        return { "better-sqlite3": "^12.6.0" };
    }
  }

  private dbConfig(appName: string, db: string): string {
    switch (db) {
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
      default:
        return `export default {
  development: {
    adapter: "sqlite3",
    database: "db/development.sqlite3",
  },
  test: {
    adapter: "sqlite3",
    database: "db/test.sqlite3",
  },
  production: {
    adapter: "sqlite3",
    database: "db/production.sqlite3",
  },
};
`;
    }
  }
}
