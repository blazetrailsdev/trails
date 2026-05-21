// Mirrors railties/lib/rails/generators/rails/db/system/change/change_generator.rb.
// Trailties substitutions: the Rails generator rewrites `config/database.yml`
// (ERB/YAML) and `Gemfile`. Trailties emits `src/config/database.ts` and
// `package.json` instead, so `editDatabaseConfig` rewrites the TS module and
// `editPackageJson` swaps the database dependency. Dockerfile rewriting
// mirrors Rails when the Dockerfile carries db-specific apt packages.
// Devcontainer file rewriting is deferred until trailties' devcontainer
// generator (#2221) lands.

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
    this.appName = options.appName ?? "app";
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
    const target = "src/config/database.ts";
    const content = databaseConfigTs(this.database, this.appName);
    const full = this.path.join(this.cwd, target);
    this.fs.mkdirSync(this.path.dirname(full), { recursive: true });
    this.fs.writeFileSync(full, content);
    this.output(`     update  ${target}`);
  }

  editPackageJson(): void {
    if (!this.fileExists("package.json")) return;
    const fullPath = this.path.join(this.cwd, "package.json");
    const raw = this.fs.readFileSync(fullPath, "utf-8");
    let pkg: { dependencies?: Record<string, string> } & Record<string, unknown>;
    try {
      pkg = JSON.parse(raw);
    } catch {
      return;
    }
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    for (const d of Database.all()) delete deps[d.pkgDependency.name];
    const target = this.database.pkgDependency;
    deps[target.name] = target.version;
    pkg.dependencies = deps;
    this.fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
    this.output(`     update  package.json`);
  }

  editDockerfile(): void {
    if (!this.fileExists("Dockerfile")) return;
    const fullPath = this.path.join(this.cwd, "Dockerfile");
    let content = this.fs.readFileSync(fullPath, "utf-8");
    content = gsub(content, allDockerBasesRegex(), dockerBasePackages(this.database.basePackage));
    content = gsub(
      content,
      allDockerBuildsRegex(),
      dockerBuildPackages(this.database.buildPackage),
    );
    this.fs.writeFileSync(fullPath, content);
    this.output(`     update  Dockerfile`);
  }

  editDevcontainerFiles(): void {
    // Deferred: trailties' devcontainer generator (#2221) is in flight.
    // Once its emission shape is known, this method will edit
    // `.devcontainer/devcontainer.json` and `.devcontainer/compose.yaml`
    // analogous to Rails' edit_devcontainer_json / edit_compose_yaml.
  }
}

function databaseConfigTs(database: Database, appName: string): string {
  if (database.name === "sqlite3") {
    return [
      `export default {`,
      ...["development", "test", "production"].map(
        (env) => `  ${env}: { adapter: "sqlite3", database: "db/${env}.sqlite3" },`,
      ),
      `};`,
      ``,
    ].join("\n");
  }
  const adapter = database.name === "postgres" ? "postgresql" : "mysql2";
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

function dockerBasePackages(databasePackage: string | undefined): string {
  const set = databasePackage ? [databasePackage, ...BASE_PACKAGES].sort() : [...BASE_PACKAGES];
  return set.join(" ");
}

function dockerBuildPackages(databasePackage: string | undefined): string {
  const set = databasePackage ? [databasePackage, ...BUILD_PACKAGES].sort() : [...BUILD_PACKAGES];
  return set.join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function altRegex(values: string[]): RegExp {
  return new RegExp([...new Set(values)].map(escapeRegex).join("|"), "g");
}

function allDockerBasesRegex(): RegExp {
  return altRegex(Database.all().map((d) => dockerBasePackages(d.basePackage)));
}

function allDockerBuildsRegex(): RegExp {
  return altRegex(Database.all().map((d) => dockerBuildPackages(d.buildPackage)));
}

function gsub(haystack: string, pattern: RegExp, replacement: string): string {
  return haystack.replace(pattern, replacement);
}
