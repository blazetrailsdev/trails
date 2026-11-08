import "../../../../../constants.trails-db-system-change-change-generator.generated.js";
/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- `include AppName` (`change_generator.rb:12`); the class/interface merge is how the mixin surfaces on the type side. */
import { any } from "@blazetrails/activesupport";
import {
  aryDelete,
  File,
  include,
  type Included,
  rbObjDup,
  flatten,
  Hash,
  JSON,
  hashDelete,
} from "@blazetrails/ruby-compat";
import { toYaml, YAML } from "@blazetrails/ruby-compat/yaml";
import { Base, type GeneratorOptions, type GeneratorConfig } from "../../../../base.js";
import {
  Database,
  DATABASES,
  type DatabaseName,
  type PkgDependency,
} from "../../../../database.js";
import { AppName } from "../../../../app-name.js";
import { Error as GeneratorError } from "../../../../base.js";

const BASE_PACKAGES = ["curl", "libvips"];
const BUILD_PACKAGES = ["build-essential", "git"];

export interface ChangeGeneratorOptions extends GeneratorOptions {
  to: string;
  database?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChangeGenerator extends Included<typeof AppName> {}

export class ChangeGenerator extends Base {
  static override readonly name = "Trails::Generators::Db::System::ChangeGenerator";

  static {
    include(this as unknown as new (...args: unknown[]) => unknown, AppName);
    this.classOption("to", { required: true, desc: "The database system to switch to." });

    this.noCommands(() => this.methodAdded("isDevcontainer"));
    this.methodAdded("editDatabaseConfig");
    this.methodAdded("editPackageJson");
    this.methodAdded("editDockerfile");
    this.methodAdded("editDevcontainerFiles");
  }

  /** @internal */
  protected static override async defaultGeneratorRoot(): Promise<string | undefined> {
    const path = File.expandPath(File.join(this.baseName()!, "app"), this.baseRoot());
    if (File.isExist(path)) return path;
  }

  private _database?: Database;
  private _devcontainer?: boolean;
  private _devcontainerJson?: Record<string, unknown>;

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);

    if (!(DATABASES as readonly string[]).includes((this.options as ChangeGeneratorOptions).to)) {
      throw new GeneratorError(
        `Invalid value for --to option. Supported preconfigurations are: ${DATABASES.join(", ")}.`,
      );
    }

    const opt = rbObjDup(this.options) as ChangeGeneratorOptions;
    opt.database ||= opt.to;
    this.options = Object.freeze(opt);
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

  /** @internal */
  isDevcontainer(): boolean {
    if (this._devcontainer !== undefined) return this._devcontainer;

    return (this._devcontainer = File.isExist(
      File.expandPath(".devcontainer", this.destinationRoot),
    ));
  }

  /** @missingRailsArgs template — PERMANENT */
  async editDatabaseConfig(): Promise<void> {
    const target =
      ["config/database.ts", "config/database.js"].find((p) =>
        File.isExist(File.join(this.destinationRoot, p)),
      ) ?? `config/database${this.ext()}`;
    await this.template(this.database.template, target);
  }

  async editPackageJson(): Promise<void> {
    const { name, version } = this.database.pkgDependency;
    await this.gsubFile("package.json", this.allDatabaseGemsRegex(), name);
    await this.gsubFile(
      "package.json",
      this.gemEntryRegexFor(name),
      this.gemEntryFor(name, version),
    );
  }

  async editDockerfile(): Promise<void> {
    const dockerfilePath = File.expandPath("Dockerfile", this.destinationRoot);
    if (!File.isExist(dockerfilePath)) return;

    await this.gsubFile(
      "Dockerfile",
      this.allDockerBasesRegex(),
      this.dockerBasePackages(this.database.basePackage),
    );
    await this.gsubFile(
      "Dockerfile",
      this.allDockerBuildsRegex(),
      this.dockerBuildPackages(this.database.buildPackage),
    );
  }

  async editDevcontainerFiles(): Promise<void> {
    if (!this.isDevcontainer()) return;

    await this.editDevcontainerJson();
    this.editComposeYaml();
  }

  /** @internal */
  private allDatabaseGems(): PkgDependency[] {
    return Database.all().map((database) => database.pkgDependency);
  }

  /** @internal */
  private allDockerBases(): string[] {
    return [
      ...new Set(Database.all().map((database) => this.dockerBasePackages(database.basePackage))),
    ];
  }

  /** @internal */
  private dockerBasePackages(databasePackage: string | undefined): string {
    return (databasePackage ? [databasePackage, ...BASE_PACKAGES].sort() : BASE_PACKAGES).join(" ");
  }

  /** @internal */
  private allDockerBuilds(): string[] {
    return [
      ...new Set(Database.all().map((database) => this.dockerBuildPackages(database.buildPackage))),
    ];
  }

  /** @internal */
  private dockerBuildPackages(databasePackage: string | undefined): string {
    return (databasePackage ? [databasePackage, ...BUILD_PACKAGES].sort() : BUILD_PACKAGES).join(
      " ",
    );
  }

  /** @internal */
  private allDatabaseGemsRegex(): RegExp {
    const allDatabaseGemNames = this.allDatabaseGems().map((gem) => gem.name);
    return new RegExp(`(\\b${allDatabaseGemNames.join("\\b|\\b")}\\b)`);
  }

  /** @internal */
  private allDockerBasesRegex(): RegExp {
    return new RegExp(`(\\b${this.allDockerBases().join("\\b|\\b")}\\b)`);
  }

  /** @internal */
  private allDockerBuildsRegex(): RegExp {
    return new RegExp(`(\\b${this.allDockerBuilds().join("\\b|\\b")}\\b)`);
  }

  /** @internal */
  private gemEntryRegexFor(gemName: string): RegExp {
    return new RegExp(`"${gemName}"\\s*:\\s*"[^"]*"`);
  }

  /** @internal */
  private gemEntryFor(...gemNameAndVersion: string[]): string {
    gemNameAndVersion = gemNameAndVersion.map((segment) => `"${segment}"`);
    return gemNameAndVersion.join(": ");
  }

  /** @internal */
  private async editDevcontainerJson(): Promise<void> {
    if (!this.devcontainerJson()) return;

    await this.updateDevcontainerDbHost();
    await this.updateDevcontainerDbFeature();
  }

  private editComposeYaml(): void {
    const composeYamlPath = File.expandPath(".devcontainer/compose.yaml", this.destinationRoot);
    if (!File.isExist(composeYamlPath)) return;

    const composeConfig = YAML.loadFile(composeYamlPath) as Hash<string, any>;

    for (const database of Database.all()) {
      hashDelete(composeConfig.get("services"), database.name);
      const volumes = composeConfig.get("volumes");
      if (volumes != null) hashDelete(volumes, database.volume!);
      const dependsOn = composeConfig.get("services").get("trails-app").get("depends_on");
      if (dependsOn != null) aryDelete(dependsOn, database.name);
    }

    if (this.database.service) {
      composeConfig.get("services").set(this.database.name, this.database.service);
      composeConfig.set(
        "volumes",
        new Hash<string, unknown>()
          .set(this.database.volume!, null)
          .merge(composeConfig.get("volumes") ?? new Hash()),
      );
      composeConfig
        .get("services")
        .get("trails-app")
        .set(
          "depends_on",
          flatten([
            this.database.name,
            composeConfig.get("services").get("trails-app").get("depends_on"),
          ]).filter((x) => x != null),
        );
    }

    const volumes = composeConfig.get("volumes");
    if (!(volumes != null && any([...volumes]))) hashDelete(composeConfig, "volumes");
    const dependsOn = composeConfig.get("services").get("trails-app").get("depends_on");
    if (!(dependsOn != null && any(dependsOn))) {
      hashDelete(composeConfig.get("services").get("trails-app"), "depends_on");
    }

    File.write(composeYamlPath, toYaml(composeConfig));
  }

  /** @internal */
  private async updateDevcontainerDbHost(): Promise<void> {
    const containerEnv = this.devcontainerJson()!.containerEnv as Record<string, string>;
    const dbName = this.database.name;

    if (containerEnv.DB_HOST != null) {
      if (this.database.service) {
        containerEnv.DB_HOST = dbName;
      } else {
        delete containerEnv.DB_HOST;
      }
    } else {
      if (this.database.service) {
        containerEnv.DB_HOST = dbName;
      }
    }

    const newJson = JSON.prettyGenerate(containerEnv, { indent: "  ", objectNl: "\n  " });

    await this.gsubFile(
      ".devcontainer/devcontainer.json",
      /("containerEnv"\s*:\s*)(.|\n)*?(^\s{2}})/m,
      `\\1${newJson}`,
    );
  }

  /** @internal */
  private async updateDevcontainerDbFeature(): Promise<void> {
    const features = this.devcontainerJson()!.features as Record<string, unknown>;
    const dbFeature = this.database.feature;

    for (const database of Database.all()) {
      delete features[database.featureName!];
    }

    if (dbFeature) Object.assign(features, dbFeature);

    const newJson = JSON.prettyGenerate(features, { indent: "  ", objectNl: "\n  " });

    await this.gsubFile(
      ".devcontainer/devcontainer.json",
      /("features"\s*:\s*)(.|\n)*?(^\s{2}})/m,
      `\\1${newJson}`,
    );
  }

  /** @internal */
  private devcontainerJson(): Record<string, unknown> | undefined {
    if (!File.isExist(this.devcontainerJsonPath())) return;

    return (this._devcontainerJson ??= JSON.parse(File.read(this.devcontainerJsonPath())) as Record<
      string,
      unknown
    >);
  }

  /** @internal */
  private devcontainerJsonPath(): string {
    return File.expandPath(".devcontainer/devcontainer.json", this.destinationRoot);
  }
}
