// Mirrors railties/lib/rails/generators/rails/db/system/change/change_generator.rb.
// Trailties substitutions: the Rails generator rewrites `config/database.yml`
// (ERB/YAML) and `Gemfile`. Trailties emits `src/config/database.ts` and
// `package.json` instead, so `editDatabaseConfig` rewrites the TS module and
// `editPackageJson` swaps the database dependency. Dockerfile rewriting
// mirrors Rails when the Dockerfile carries db-specific apt packages.
// `editDevcontainerFiles` mirrors Rails' edit_devcontainer_json / edit_compose_yaml;
// compose.yaml is read/written as JSON because DevcontainerGenerator serialises it
// with JSON.stringify (JSON is valid YAML, so Docker Compose accepts it).

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
    // Mirrors railties' AppName module: derive from destination_root basename.
    this.appName = options.appName ?? this.path.basename(this.cwd);
  }

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

  editDatabaseConfig(): void {
    // Candidate order matches the runtime loader in trailties/src/database.ts
    // so editing prefers the active config; fall back to src/config when none exist.
    const target =
      [
        "config/database.ts",
        "config/database.js",
        "src/config/database.ts",
        "src/config/database.js",
      ].find((p) => this.fileExists(p)) ?? `src/config/database${this.ext()}`;
    this.writeOrUpdate(target, databaseConfigTs(this.to, this.database, this.appName));
  }

  editPackageJson(): void {
    if (!this.fileExists("package.json")) return;
    const fullPath = this.path.join(this.cwd, "package.json");
    const raw = this.fs.readFileSync(fullPath, "utf-8");
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

  // Mirrors railties change_generator.rb's exact-string gsub against
  // all_docker_bases_regex / all_docker_builds_regex: matches only the
  // package lists `dockerPackages(...)` would emit for a known database.
  // Trailties' current AppGenerator Dockerfile (app-generator.ts) doesn't
  // emit those lines today, so on a default-generated app this is a no-op
  // until AppGenerator's Dockerfile is aligned with the Database registry
  // (tracked under PR 1.14d in docs/trailties-plan.md).
  editDockerfile(): void {
    if (!this.fileExists("Dockerfile")) return;
    const fullPath = this.path.join(this.cwd, "Dockerfile");
    const before = this.fs.readFileSync(fullPath, "utf-8");
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
    const full = this.path.join(this.cwd, relativePath);
    const existed = this.fileExists(relativePath);
    if (existed && this.fs.readFileSync(full, "utf-8") === content) {
      this.output(`   identical  ${relativePath}`);
      return;
    }
    this.fs.mkdirSync(this.path.dirname(full), { recursive: true });
    this.fs.writeFileSync(full, content);
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
    const full = this.path.join(this.cwd, rel);
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(this.fs.readFileSync(full, "utf-8")) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `Could not parse ${full}: ${(e as Error).message}. Fix the file and re-run.`,
        {
          cause: e,
        },
      );
    }

    // Mirrors edit_devcontainer_json: update DB_HOST and db feature entry.
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
    const full = this.path.join(this.cwd, rel);
    let compose: {
      services: Record<string, Record<string, unknown>>;
      volumes?: Record<string, unknown>;
      [k: string]: unknown;
    };
    try {
      compose = JSON.parse(this.fs.readFileSync(full, "utf-8"));
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

function databaseConfigTs(to: DatabaseName, database: Database, appName: string): string {
  if (to === "sqlite3") {
    return [
      `export default {`,
      ...["development", "test", "production"].map(
        (env) => `  ${env}: { adapter: "sqlite3", database: "db/${env}.sqlite3" },`,
      ),
      `};`,
      ``,
    ].join("\n");
  }
  // `to` is the adapter id (`postgresql` | `mysql` | `mariadb-mysql`);
  // `Database#name` is a service/volume identifier and not safe to switch on.
  const adapter = to === "postgresql" ? "postgresql" : "mysql2";
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
  // Mirrors railties change_generator.rb: each alternation arm is wrapped in
  // \b boundaries so the package list only matches as a whole word run
  // (e.g. won't partial-match inside `build-essential git libfoo-dev` if the
  // arm is `build-essential git`). Sort by descending length first because
  // JS regex alternation is first-match, not longest-match.
  const alts = [...new Set(Database.all().map((d) => dockerPackages(base, pick(d))))].sort(
    (a, b) => b.length - a.length,
  );
  const escaped = alts.map((s) => `\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return new RegExp(escaped.join("|"), "g");
}
