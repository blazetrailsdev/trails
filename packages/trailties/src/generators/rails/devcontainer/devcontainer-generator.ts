import { File } from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { Database, DATABASES, type DatabaseName } from "../../database.js";
import { Generators } from "../../../generators.js";
export type SqliteDriver = "better-sqlite3" | "node-sqlite" | "expo-sqlite";
export interface DevcontainerGeneratorOptions extends GeneratorOptions {
  appName?: string;
  database?: DatabaseName;
  redis?: boolean;
  systemTest?: boolean;
  activeStorage?: boolean;
  node?: boolean;
  dev?: boolean;
  kamal?: boolean;
  sqliteDriver?: SqliteDriver;
  nodeVersion?: string;
}

type JsonObject = { [k: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type ResolvedOptions = Required<Omit<DevcontainerGeneratorOptions, keyof GeneratorOptions>>;

export class DevcontainerGenerator extends GeneratorBase {
  static {
    this.classOption("appName", { type: "string", default: "rails_app", desc: "Name of the app" });
    this.classOption("database", {
      enum: DATABASES,
      type: "string",
      default: "sqlite3",
      desc: "Include configuration for selected database",
    });
    this.classOption("redis", {
      type: "boolean",
      default: true,
      desc: "Include configuration for Redis",
    });
    this.classOption("systemTest", {
      type: "boolean",
      default: true,
      desc: "Include configuration for System Tests",
    });
    this.classOption("activeStorage", {
      type: "boolean",
      default: true,
      desc: "Include configuration for Active Storage",
    });
    this.classOption("node", {
      type: "boolean",
      default: false,
      desc: "Include configuration for Node",
    });
    this.classOption("dev", {
      type: "boolean",
      default: false,
      desc: "For applications pointing to a local Rails checkout",
    });
    this.classOption("kamal", {
      type: "boolean",
      default: true,
      desc: "Include configuration for Kamal",
    });
    this.classOption("skipSolid", {
      type: "boolean",
      default: null,
      desc: "Skip Solid Cache, Queue, and Cable setup",
    });
  }

  readonly opts: ResolvedOptions;
  private _dependencies?: string[];
  private _volumes?: string[];
  /** @internal */
  readonly database: Database;

  constructor(options: DevcontainerGeneratorOptions) {
    super(options);
    const { appName, database, redis, systemTest, activeStorage, node, dev, kamal } = this
      .options as Required<DevcontainerGeneratorOptions>;
    if (!(DATABASES as readonly string[]).includes(database))
      throw new Error(`Unknown database: ${database}`);
    this.opts = {
      appName,
      database,
      redis,
      systemTest,
      activeStorage,
      node,
      dev,
      kamal,
      sqliteDriver: options.sqliteDriver ?? "better-sqlite3",
      nodeVersion: options.nodeVersion ?? "24.16.0",
    };
    this.database = Database.build(database);
  }

  run(): string[] {
    this.createFile(".devcontainer/devcontainer.json", this.devcontainerJson());
    this.createFile(".devcontainer/Dockerfile", this.dockerfileContent());
    this.createFile(".devcontainer/compose.yaml", this.composeYaml());
    this.gsubFile(
      "test/application_system_test_case.ts",
      /^\s*drivenBy\b.*$/m,
      this.systemTestConfiguration(),
      this.opts.systemTest,
    );
    this.gsubFile(
      "config/database.ts",
      /host:\s*"localhost"/g,
      'host: process.env.DB_HOST ?? "localhost"',
      this.opts.database !== "sqlite3",
    );
    return this.getCreatedFiles();
  }

  private gsubFile(rel: string, re: RegExp, replacement: string, enabled: boolean): void {
    if (!enabled || !this.fileExists(rel)) return;
    const full = File.join(this.cwd, rel);
    File.write(full, File.read(full).replace(re, replacement));
    this.output(`      update  ${rel}`);
  }

  private dockerfileContent(): string {
    return [
      `ARG NODE_VERSION=${this.opts.nodeVersion}`,
      "FROM mcr.microsoft.com/devcontainers/javascript-node:1-${NODE_VERSION}",
      "",
    ].join("\n");
  }

  private devcontainerJson(): string {
    const { appName, dev, systemTest, redis, activeStorage, node, kamal } = this.opts;
    const features: JsonObject = { "ghcr.io/devcontainers/features/github-cli:1": {} };
    if (activeStorage) features["ghcr.io/rails/devcontainer/features/activestorage"] = {};
    if (node) features["ghcr.io/devcontainers/features/node:1"] = {};
    if (kamal) features["ghcr.io/devcontainers/features/docker-outside-of-docker:1"] = {};
    const includeDb =
      this.opts.database !== "sqlite3" || this.opts.sqliteDriver === "better-sqlite3";
    if (this.database.feature && includeDb) Object.assign(features, this.database.feature);

    const env: Record<string, string> = {};
    if (systemTest)
      Object.assign(env, { CAPYBARA_SERVER_PORT: "45678", SELENIUM_HOST: "selenium" });
    if (redis) env.REDIS_URL = "redis://redis:6379/1";
    if (kamal) env.KAMAL_REGISTRY_PASSWORD = "$KAMAL_REGISTRY_PASSWORD";
    if (this.database.service) env.DB_HOST = this.database.name;
    const ports: number[] = [3000];
    if (this.database.port) ports.push(this.database.port);
    if (redis) ports.push(6379);
    const json: JsonObject = {
      name: appName,
      dockerComposeFile: "compose.yaml",
      service: "rails-app",
      workspaceFolder: "/workspaces/${localWorkspaceFolderBasename}",
      features,
    };
    if (Object.keys(env).length > 0) json.containerEnv = env;
    json.forwardPorts = ports;
    if (dev)
      json.mounts = [
        { type: "bind", source: Generators.RAILS_DEV_PATH, target: Generators.RAILS_DEV_PATH },
      ];
    json.postCreateCommand = "bin/setup --skip-server";
    return JSON.stringify(json, null, 2) + "\n";
  }

  private composeYaml(): string {
    const { appName, systemTest, redis } = this.opts;
    const dependencies = this.dependencies();
    const volumes = this.volumes();
    let out = `name: "${appName}"

services:
  rails-app:
    build:
      context: ..
      dockerfile: .devcontainer/Dockerfile

    volumes:
    - ../..:/workspaces:cached

    # Overrides default command so things don't shut down after the process ends.
    command: sleep infinity

    # Uncomment the next line to use a non-root user for all processes.
    # user: vscode

    # Use "forwardPorts" in **devcontainer.json** to forward an app port locally.
    # (Adding the "ports" property to this file will not forward from a Codespace.)
`;
    if (dependencies.length > 0) {
      out += "    depends_on:\n";
      for (const dependency of dependencies) out += `    - ${dependency}\n`;
    }
    if (systemTest) {
      out += `
  selenium:
    image: selenium/standalone-chromium
    restart: unless-stopped
`;
    }
    out += "\n";
    if (redis) {
      out += `  redis:
    image: redis:7.2
    restart: unless-stopped
    volumes:
    - redis-data:/data

`;
    }
    out += `  ${this.devcontainerDbServiceYaml({ indentation: 4 }) ?? ""}\n`;
    if (volumes.length > 0) {
      out += "volumes:\n";
      for (const volume of volumes) out += `  ${volume}:\n`;
    }
    return out;
  }

  private dependencies(): string[] {
    if (this._dependencies) return this._dependencies;

    this._dependencies = [];

    const options = this.options as DevcontainerGeneratorOptions;
    if (options.systemTest) this._dependencies.push("selenium");
    if (options.redis) this._dependencies.push("redis");
    if (this.database.service) this._dependencies.push(this.database.name);
    return this._dependencies;
  }

  private volumes(): string[] {
    if (this._volumes) return this._volumes;

    this._volumes = [];

    const options = this.options as DevcontainerGeneratorOptions;
    if (options.redis) this._volumes.push("redis-data");
    if (this.database.volume) this._volumes.push(this.database.volume);

    return this._volumes;
  }

  private devcontainerDbServiceYaml(
    options: Parameters<typeof toYaml>[1] = {},
  ): string | undefined {
    const service = this.database.service;
    if (!service) return;

    return toYaml({ [this.database.name]: service }, options).slice(4);
  }

  private systemTestConfiguration(): string {
    return `  if (process.env.CAPYBARA_SERVER_PORT) {
    servedBy({ host: "rails-app", port: process.env.CAPYBARA_SERVER_PORT });
    drivenBy(":selenium", { using: ":headless_chrome", screenSize: [1400, 1400], options: { browser: ":remote", url: \`http://\${process.env.SELENIUM_HOST}:4444\` } });
  } else {
    drivenBy(":selenium", { using: ":headless_chrome", screenSize: [1400, 1400] });
  }`;
  }
}
