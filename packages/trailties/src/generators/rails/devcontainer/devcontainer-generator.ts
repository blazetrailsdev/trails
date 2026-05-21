// Mirrors railties/lib/rails/generators/rails/devcontainer/devcontainer_generator.rb.
import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { Database, DATABASES, type DatabaseName } from "../../database.js";
export const TRAILS_DEV_PATH = "/workspaces/trails";
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
type ResolvedOptions = Required<Omit<DevcontainerGeneratorOptions, "cwd" | "output">>;

export class DevcontainerGenerator extends GeneratorBase {
  readonly opts: ResolvedOptions;
  readonly database: Database;

  constructor(options: DevcontainerGeneratorOptions) {
    super(options);
    const database = options.database ?? "sqlite3";
    if (!(DATABASES as readonly string[]).includes(database))
      throw new Error(`Unknown database: ${database}`);
    this.opts = {
      appName: options.appName ?? "rails_app",
      database,
      redis: options.redis !== false,
      systemTest: options.systemTest !== false,
      activeStorage: options.activeStorage !== false,
      node: options.node === true,
      dev: options.dev === true,
      kamal: options.kamal !== false,
      sqliteDriver: options.sqliteDriver ?? "better-sqlite3",
      nodeVersion: options.nodeVersion ?? "22.0.0",
    };
    this.database = Database.build(database);
  }

  run(): string[] {
    this.createFile(".devcontainer/devcontainer.json", this.devcontainerJson());
    this.createFile(
      ".devcontainer/Dockerfile",
      `ARG NODE_VERSION=${this.opts.nodeVersion}\nFROM mcr.microsoft.com/devcontainers/javascript-node:1-\${NODE_VERSION}\n`,
    );
    this.createFile(".devcontainer/compose.yaml", this.composeYaml());
    this.gsubFile(
      "test/application_system_test_case.ts",
      /^\s*drivenBy\b.*$/m,
      this.systemTestConfiguration(),
      this.opts.systemTest,
    );
    this.gsubFile(
      "src/config/database.ts",
      /host:\s*"localhost"/g,
      'host: process.env.DB_HOST ?? "localhost"',
      this.opts.database !== "sqlite3",
    );
    return this.getCreatedFiles();
  }

  private gsubFile(rel: string, re: RegExp, replacement: string, enabled: boolean): void {
    if (!enabled || !this.fileExists(rel)) return;
    const full = this.path.join(this.cwd, rel);
    this.fs.writeFileSync(full, this.fs.readFileSync(full, "utf-8").replace(re, replacement));
    this.output(`      update  ${rel}`);
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
    if (dev) json.mounts = [{ type: "bind", source: TRAILS_DEV_PATH, target: TRAILS_DEV_PATH }];
    json.postCreateCommand = "bin/setup --skip-server";
    return JSON.stringify(json, null, 2) + "\n";
  }

  private composeYaml(): string {
    const { systemTest, redis, appName } = this.opts;
    const { name: dbName, service: dbService, volume: dbVolume } = this.database;
    const deps: string[] = [];
    if (systemTest) deps.push("selenium");
    if (redis) deps.push("redis");
    if (dbService) deps.push(dbName);
    const railsApp: JsonObject = {
      build: { context: "..", dockerfile: ".devcontainer/Dockerfile" },
      volumes: ["../..:/workspaces:cached"],
      command: "sleep infinity",
    };
    if (deps.length > 0) railsApp.depends_on = deps;
    const services: JsonObject = { "rails-app": railsApp };
    if (systemTest)
      services.selenium = { image: "selenium/standalone-chromium", restart: "unless-stopped" };
    if (redis)
      services.redis = {
        image: "redis:7.2",
        restart: "unless-stopped",
        volumes: ["redis-data:/data"],
      };
    if (dbService) services[dbName] = dbService as unknown as JsonObject;
    const yaml: JsonObject = { name: appName, services };
    const volumes: JsonObject = {};
    if (redis) volumes["redis-data"] = null;
    if (dbVolume) volumes[dbVolume] = null;
    if (Object.keys(volumes).length > 0) yaml.volumes = volumes;
    return JSON.stringify(yaml, null, 2) + "\n";
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
