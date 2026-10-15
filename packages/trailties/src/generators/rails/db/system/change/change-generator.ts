import { any } from "@blazetrails/activesupport";
import { aryDelete, compact, File, FileUtils, flatten } from "@blazetrails/ruby-compat";
import { toYaml, YAML } from "@blazetrails/ruby-compat/yaml";
import { GeneratorBase, type GeneratorOptions } from "../../../../base.js";
import { Database, DATABASES, type DatabaseName } from "../../../../database.js";
import { TEMPLATES } from "../../../app/templates.js";

const BASE_PACKAGES = ["curl", "libvips"];
const BUILD_PACKAGES = ["build-essential", "git"];

export interface ChangeGeneratorOptions extends GeneratorOptions {
  to: string;
  database?: string;
  appName?: string;
}

export class ChangeGenerator extends GeneratorBase {
  /** @internal */
  readonly appName: string;
  private _database?: Database;

  constructor(options: ChangeGeneratorOptions) {
    super(options);

    if (!(DATABASES as readonly string[]).includes((this.options as ChangeGeneratorOptions).to)) {
      throw new Error(
        `Invalid value for --to option. Supported preconfigurations are: ${DATABASES.join(", ")}.`,
      );
    }

    const opt = { ...this.options } as ChangeGeneratorOptions;
    opt.database ||= opt.to;
    this.options = Object.freeze(opt);
    this.appName = options.appName ?? File.basename(this.cwd);
  }

  /** @internal */
  get database(): Database {
    if (!this._database) {
      this._database = Database.build(
        (this.options as ChangeGeneratorOptions).database as DatabaseName,
      );
    }
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
    this.writeOrUpdate(
      destination,
      TEMPLATES[source]({ appName: this.appName, database: this.database }),
    );
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
    const composeYamlPath = File.expandPath(".devcontainer/compose.yaml", this.cwd);
    if (!File.isExist(composeYamlPath)) return;

    const composeConfig = YAML.loadFile(composeYamlPath) as {
      services: Record<string, Record<string, unknown>>;
      volumes?: Record<string, unknown> | null;
      [k: string]: unknown;
    };

    for (const database of Database.all()) {
      delete composeConfig["services"][database.name];
      if (composeConfig["volumes"] != null) delete composeConfig["volumes"][database.volume!];
      const dependsOn = composeConfig["services"]["rails-app"]["depends_on"] as string[] | null;
      if (dependsOn != null) aryDelete(dependsOn, database.name);
    }

    if (this.database.service) {
      composeConfig["services"][this.database.name] = this.database.service as unknown as Record<
        string,
        unknown
      >;
      composeConfig["volumes"] = {
        [this.database.volume!]: null,
        ...(composeConfig["volumes"] ?? {}),
      };
      composeConfig["services"]["rails-app"]["depends_on"] = compact(
        flatten([this.database.name, composeConfig["services"]["rails-app"]["depends_on"]]),
      );
    }

    if (!(composeConfig["volumes"] != null && Object.keys(composeConfig["volumes"]).length > 0)) {
      delete composeConfig["volumes"];
    }
    const railsAppDependsOn = composeConfig["services"]["rails-app"]["depends_on"] as
      | unknown[]
      | null
      | undefined;
    if (!(railsAppDependsOn != null && any(railsAppDependsOn))) {
      delete composeConfig["services"]["rails-app"]["depends_on"];
    }

    File.write(composeYamlPath, toYaml(composeConfig));
  }
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
