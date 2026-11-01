import { File } from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { GeneratorBase, type GeneratorOptions, type GeneratorConfig } from "../../base.js";
import { Database, DATABASES, type DatabaseName } from "../../database.js";
import { Generators } from "../../../generators.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

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

    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.sourcePaths().push(File.expandPath("../app/templates", __dir__));

    this.methodAdded("createDevcontainer");
    this.methodAdded("updateApplicationSystemTestCase");
    this.methodAdded("updateDatabaseYml");
  }

  declare options: DevcontainerGeneratorOptions;
  readonly opts: ResolvedOptions;
  private _dependencies?: string[];
  private _containerEnv?: Record<string, string>;
  private _volumes?: string[];
  private _features?: Record<string, object>;
  private _mounts?: Record<string, string>[];
  private _forwardPorts?: number[];
  /** @internal */
  readonly database: Database;

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
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
      sqliteDriver: this.options.sqliteDriver ?? "better-sqlite3",
      nodeVersion: this.options.nodeVersion ?? "24.16.0",
    };
    this.database = Database.build(database);
  }

  async createDevcontainer(): Promise<void> {
    await this.emptyDirectory(".devcontainer");

    await this.template("devcontainer/devcontainer.json", ".devcontainer/devcontainer.json");
    await this.template("devcontainer/Dockerfile", ".devcontainer/Dockerfile");
    await this.template("devcontainer/compose.yaml", ".devcontainer/compose.yaml");
  }

  /** @missingRailsArgs expand_path — PERMANENT */
  async updateApplicationSystemTestCase(): Promise<void> {
    if (!this.options.systemTest) return;

    const systemTestCasePath = File.expandPath(
      "test/application_system_test_case.ts",
      this.destinationRoot,
    );
    if (!File.isExist(systemTestCasePath)) return;

    await this.gsubFile(systemTestCasePath, /^\s*drivenBy\b.*/gm, this.systemTestConfiguration());
  }

  async updateDatabaseYml(): Promise<void> {
    if (this.options.database !== "postgresql") return;

    await this.template(`config/databases/${this.options.database}.yml`, "config/database.ts");
  }

  /** @internal */
  private isDevcontainer(): boolean {
    return true;
  }

  /** @internal */
  private appName(): string {
    return this.options.appName!;
  }

  private dependencies(): string[] {
    if (this._dependencies) return this._dependencies;

    this._dependencies = [];

    const options = this.options;
    if (options.systemTest) this._dependencies.push("selenium");
    if (options.redis) this._dependencies.push("redis");
    if (this.database.service) this._dependencies.push(this.database.name);
    return this._dependencies;
  }

  private containerEnv(): Record<string, string> {
    if (this._containerEnv) return this._containerEnv;

    this._containerEnv = {};

    const options = this.options;
    if (options.systemTest) this._containerEnv.TRAILS_SYSTEM_TESTING_SERVER_PORT = "45678";
    if (options.systemTest) this._containerEnv.SELENIUM_HOST = "selenium";
    if (options.redis) this._containerEnv.REDIS_URL = "redis://redis:6379/1";
    if (options.kamal) this._containerEnv.KAMAL_REGISTRY_PASSWORD = "$KAMAL_REGISTRY_PASSWORD";
    if (this.database.service) this._containerEnv.DB_HOST = this.database.name;

    return this._containerEnv;
  }

  private volumes(): string[] {
    if (this._volumes) return this._volumes;

    this._volumes = [];

    const options = this.options;
    if (options.redis) this._volumes.push("redis-data");
    if (this.database.volume) this._volumes.push(this.database.volume);

    return this._volumes;
  }

  private features(): Record<string, object> {
    if (this._features) return this._features;

    this._features = { "ghcr.io/devcontainers/features/github-cli:1": {} };

    const options = this.options;
    if (options.activeStorage)
      this._features["ghcr.io/rails/devcontainer/features/activestorage"] = {};
    if (options.node) this._features["ghcr.io/devcontainers/features/node:1"] = {};
    if (options.kamal)
      this._features["ghcr.io/devcontainers/features/docker-outside-of-docker:1"] = {};

    const includeDb =
      this.opts.database !== "sqlite3" || this.opts.sqliteDriver === "better-sqlite3";
    if (this.database.feature && includeDb) Object.assign(this._features, this.database.feature);

    return this._features;
  }

  private mounts(): Record<string, string>[] {
    if (this._mounts) return this._mounts;

    this._mounts = [];

    if (this.options.dev) this._mounts.push(this.localRailsMount());

    return this._mounts;
  }

  private forwardPorts(): number[] {
    if (this._forwardPorts) return this._forwardPorts;

    this._forwardPorts = [3000];
    if (this.database.port) this._forwardPorts.push(this.database.port);
    if (this.options.redis) this._forwardPorts.push(6379);

    return this._forwardPorts;
  }

  private devcontainerDbServiceYaml(
    options: Parameters<typeof toYaml>[1] = {},
  ): string | undefined {
    const service = this.database.service;
    if (!service) return;

    return toYaml({ [this.database.name]: service }, options).slice(4);
  }

  private localRailsMount(): Record<string, string> {
    return {
      type: "bind",
      source: Generators.RAILS_DEV_PATH,
      target: Generators.RAILS_DEV_PATH,
    };
  }

  private systemTestConfiguration(): string {
    return `  if (process.env.TRAILS_SYSTEM_TESTING_SERVER_PORT) {
    servedBy({ host: "rails-app", port: process.env.TRAILS_SYSTEM_TESTING_SERVER_PORT });
    drivenBy(":selenium", { using: ":headless_chrome", screenSize: [1400, 1400], options: { browser: ":remote", url: \`http://\${process.env.SELENIUM_HOST}:4444\` } });
  } else {
    drivenBy(":selenium", { using: ":headless_chrome", screenSize: [1400, 1400] });
  }`;
  }
}
