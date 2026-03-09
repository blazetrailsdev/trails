import * as path from "node:path";
import { execSync } from "node:child_process";
import { GeneratorBase, GeneratorOptions } from "./base.js";

export interface AppOptions {
  database: "sqlite" | "postgres" | "mysql";
  skipGit?: boolean;
  skipInstall?: boolean;
}

export class AppGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  async run(name: string, options: AppOptions): Promise<string[]> {
    const appDir = path.join(this.cwd, name);
    this.cwd = appDir;

    this.output(`Creating new rails-ts application: ${name}`);
    this.output("");

    // package.json
    this.createFile("package.json", JSON.stringify({
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        build: "tsc",
        test: "vitest run",
        dev: "rails-ts server",
        "db:migrate": "rails-ts db migrate",
      },
      dependencies: {
        "@rails-ts/activerecord": "*",
        "@rails-ts/activesupport": "*",
        "@rails-ts/rack": "*",
        "@rails-ts/actionpack": "*",
        "@rails-ts/cli": "*",
        ...this.dbDependency(options.database),
      },
      devDependencies: {
        typescript: "^5.7.0",
        vitest: "^3.0.0",
      },
    }, null, 2) + "\n");

    // tsconfig.json
    this.createFile("tsconfig.json", JSON.stringify({
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
      },
      include: ["src"],
    }, null, 2) + "\n");

    // .gitignore
    this.createFile(".gitignore", `node_modules/
dist/
*.js
*.d.ts
*.js.map
.env
`);

    // Application entry
    this.createFile("src/app.ts", `// Rails-TS Application
export const APP_NAME = "${name}";
`);

    // Server entry
    this.createFile("src/server.ts", `import * as http from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = http.createServer(async (req, res) => {
  // TODO: integrate with rails-ts router
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Hello from ${name}!");
});

server.listen(PORT, () => {
  console.log(\`${name} listening on http://localhost:\${PORT}\`);
});
`);

    // Routes
    this.createFile("src/config/routes.ts", `// Define your application routes here.
// Example:
//   router.resources("posts");
//   router.get("/", "home#index");

export function drawRoutes(router: any): void {
  // routes
}
`);

    // Database config
    this.createFile("src/config/database.ts", this.dbConfig(name, options.database));

    // Application controller
    this.createFile("src/app/controllers/application-controller.ts", `import { ActionController } from "@rails-ts/actionpack";

export class ApplicationController extends ActionController.Base {
  // Base controller — all controllers inherit from this.
}
`);

    // Models directory placeholder
    this.createFile("src/app/models/.gitkeep", "");

    // Layout
    this.createFile("src/app/views/layouts/application.html.ejs", `<!DOCTYPE html>
<html>
<head>
  <title>${name}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    a { color: #0366d6; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <%- yield %>
</body>
</html>
`);

    // Migrations directory
    this.createFile("db/migrations/.gitkeep", "");

    // Seeds
    this.createFile("db/seeds.ts", `// Seed your database here.
// Example:
//   import { User } from "../src/app/models/user.js";
//   await User.create({ name: "Admin", email: "admin@example.com" });
`);

    // Test directory
    this.createFile("test/setup.ts", `// Test setup — runs before all tests.
`);

    this.output("");

    // Git init
    if (!options.skipGit) {
      try {
        execSync("git init", { cwd: appDir, stdio: "pipe" });
        this.output("  Initialized git repository");
      } catch {
        // git not available
      }
    }

    // npm install
    if (!options.skipInstall) {
      this.output("  Installing dependencies...");
      try {
        execSync("npm install", { cwd: appDir, stdio: "pipe" });
        this.output("  Dependencies installed");
      } catch {
        this.output("  Could not install dependencies — run 'npm install' manually");
      }
    }

    this.output("");
    this.output(`  Done! cd ${name} && rails-ts server`);

    return this.getCreatedFiles();
  }

  private dbDependency(db: string): Record<string, string> {
    switch (db) {
      case "postgres": return { pg: "^8.19.0" };
      case "mysql": return { mysql2: "^3.18.0" };
      case "sqlite": default: return { "better-sqlite3": "^12.6.0" };
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
