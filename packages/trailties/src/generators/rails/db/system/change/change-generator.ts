import { File, FileUtils } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "../../../../base.js";
import { Database, DATABASES, type DatabaseName } from "../../../../database.js";

const BASE_PACKAGES = ["curl", "libvips"];
const BUILD_PACKAGES = ["build-essential", "git"];

export interface ChangeGeneratorOptions extends GeneratorOptions {
  to: string;
  appName?: string;
}

export class ChangeGenerator extends GeneratorBase {
  readonly to: DatabaseName;
  /** @internal */
  readonly appName: string;
  private _database?: Database;

  constructor(options: ChangeGeneratorOptions) {
    super(options);
    if (!(DATABASES as readonly string[]).includes(options.to)) {
      throw new Error(
        `Invalid value for --to option. Supported preconfigurations are: ${DATABASES.join(", ")}.`,
      );
    }
    this.to = options.to as DatabaseName;
    this.appName = options.appName ?? File.basename(this.cwd);
  }

  /** @internal */
  get database(): Database {
    if (!this._database) this._database = Database.build(this.to);
    return this._database;
  }

  run(): string[] {
    this.editDatabaseConfig();
    this.editPackageJson();
    this.editDockerfile();
    this.editDevcontainerFiles();
    return this.getCreatedFiles();
  }

  /** @missingRailsArgs template — PERMANENT */
  editDatabaseConfig(): void {
    const target =
      ["config/database.ts", "config/database.js"].find((p) => this.fileExists(p)) ??
      `config/database${this.ext()}`;
    this.template(this.database.template, target);
  }

  private template(source: string, destination: string): void {
    this.writeOrUpdate(destination, databaseConfigTs(source, this.database, this.appName));
  }

  editPackageJson(): void {
    if (!this.fileExists("package.json")) return;
    const fullPath = File.join(this.cwd, "package.json");
    const raw = File.read(fullPath);
    let pkg: { dependencies?: unknown } & Record<string, unknown>;
    try {
      pkg = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `Could not parse ${fullPath}: ${(e as Error).message}. Fix the file and re-run.`,
        { cause: e },
      );
    }
    if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
      throw new Error(`Expected ${fullPath} to be a JSON object.`);
    }
    const rawDeps = pkg.dependencies;
    if (
      rawDeps !== undefined &&
      (rawDeps === null || typeof rawDeps !== "object" || Array.isArray(rawDeps))
    ) {
      throw new Error(`Expected ${fullPath} "dependencies" to be an object.`);
    }
    const deps = (rawDeps ?? {}) as Record<string, string>;
    for (const d of Database.all()) delete deps[d.pkgDependency.name];
    const target = this.database.pkgDependency;
    deps[target.name] = target.version;
    pkg.dependencies = deps;
    this.writeOrUpdate("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }

  editDockerfile(): void {
    if (!this.fileExists("Dockerfile")) return;
    const fullPath = File.join(this.cwd, "Dockerfile");
    const before = File.read(fullPath);
    let after = before.replace(
      dockerPackagesRegex(BASE_PACKAGES, (d) => d.basePackage),
      dockerPackages(BASE_PACKAGES, this.database.basePackage),
    );
    after = after.replace(
      dockerPackagesRegex(BUILD_PACKAGES, (d) => d.buildPackage),
      dockerPackages(BUILD_PACKAGES, this.database.buildPackage),
    );
    if (after === before) return;
    this.writeOrUpdate("Dockerfile", after);
  }

  private writeOrUpdate(relativePath: string, content: string): void {
    const full = File.join(this.cwd, relativePath);
    const existed = this.fileExists(relativePath);
    if (existed && File.read(full) === content) {
      this.output(`   identical  ${relativePath}`);
      return;
    }
    FileUtils.mkdirP(File.dirname(full));
    File.write(full, content);
    if (existed) {
      this.output(`      update  ${relativePath}`);
    } else {
      this.createdFiles.push(relativePath);
      this.output(`      create  ${relativePath}`);
    }
  }

  editDevcontainerFiles(): void {
    if (!this.fileExists(".devcontainer")) return;
    this.editDevcontainerJson();
    this.editComposeYaml();
  }

  private editDevcontainerJson(): void {
    const rel = ".devcontainer/devcontainer.json";
    if (!this.fileExists(rel)) return;
    const full = File.join(this.cwd, rel);
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(File.read(full)) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `Could not parse ${full}: ${(e as Error).message}. Fix the file and re-run.`,
        {
          cause: e,
        },
      );
    }

    const env = (json.containerEnv ?? {}) as Record<string, string>;
    if (this.database.service) {
      env.DB_HOST = this.database.name;
    } else {
      delete env.DB_HOST;
    }
    if (Object.keys(env).length > 0) {
      json.containerEnv = env;
    } else {
      delete json.containerEnv;
    }

    const features = (json.features ?? {}) as Record<string, unknown>;
    for (const d of Database.all()) {
      if (d.featureName) delete features[d.featureName];
    }
    if (this.database.feature) Object.assign(features, this.database.feature);
    if (Object.keys(features).length > 0) {
      json.features = features;
    } else {
      delete json.features;
    }

    this.writeOrUpdate(rel, JSON.stringify(json, null, 2) + "\n");
  }

  private editComposeYaml(): void {
    const rel = ".devcontainer/compose.yaml";
    if (!this.fileExists(rel)) return;
    const full = File.join(this.cwd, rel);
    let compose: {
      services: Record<string, Record<string, unknown>>;
      volumes?: Record<string, unknown>;
      [k: string]: unknown;
    };
    try {
      compose = JSON.parse(File.read(full));
    } catch (e) {
      throw new Error(
        `Could not parse ${full}: ${(e as Error).message}. Fix the file and re-run.`,
        {
          cause: e,
        },
      );
    }
    const { services } = compose;
    const volumes = compose.volumes ?? {};
    const railsApp = services["rails-app"] as
      | { depends_on?: string[]; [k: string]: unknown }
      | undefined;

    for (const d of Database.all()) {
      delete services[d.name];
      if (d.volume) delete volumes[d.volume];
      if (railsApp?.depends_on) {
        railsApp.depends_on = railsApp.depends_on.filter((dep) => dep !== d.name);
      }
    }

    if (this.database.service) {
      services[this.database.name] = this.database.service as unknown as Record<string, unknown>;
      if (this.database.volume) volumes[this.database.volume] = null;
      if (railsApp) {
        railsApp.depends_on = [this.database.name, ...(railsApp.depends_on ?? [])];
      }
    }

    if (Object.keys(volumes).length > 0) {
      compose.volumes = volumes;
    } else {
      delete compose.volumes;
    }

    if (railsApp?.depends_on?.length === 0) delete railsApp.depends_on;

    this.writeOrUpdate(rel, JSON.stringify(compose, null, 2) + "\n");
  }
}

function databaseConfigTs(template: string, database: Database, appName: string): string {
  if (template === "config/databases/sqlite3.yml") {
    return [
      `export default {`,
      ...["development", "test", "production"].map(
        (env) => `  ${env}: { adapter: "sqlite3", database: "storage/${env}.sqlite3" },`,
      ),
      `};`,
      ``,
    ].join("\n");
  }
  const adapter = template === "config/databases/postgresql.yml" ? "postgresql" : "mysql2";
  const port = database.port!;
  const block = (env: string) =>
    `  ${env}: { adapter: "${adapter}", database: "${appName}_${env}", host: "localhost", port: ${port} },`;
  return [
    `export default {`,
    block("development"),
    block("test"),
    `  production: { adapter: "${adapter}", url: process.env.DATABASE_URL },`,
    `};`,
    ``,
  ].join("\n");
}

function dockerPackages(base: string[], extra: string | undefined): string {
  return (extra ? [extra, ...base].sort() : [...base]).join(" ");
}

function dockerPackagesRegex(base: string[], pick: (d: Database) => string | undefined): RegExp {
  const alts = [...new Set(Database.all().map((d) => dockerPackages(base, pick(d))))].sort(
    (a, b) => b.length - a.length,
  );
  const escaped = alts.map((s) => `\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return new RegExp(escaped.join("|"), "g");
}
