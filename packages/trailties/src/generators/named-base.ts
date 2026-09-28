import {
  underscore,
  camelize,
  pluralize,
  singularize,
  humanize,
  upcaseFirst,
} from "@blazetrails/activesupport";
import { compact, initializeIncludedModules } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { GeneratedAttribute } from "./generated-attribute.js";

export interface NamedBaseOptions extends GeneratorOptions {
  name: string;
  attributes?: string[];
}

export class NamedBase extends GeneratorBase {
  name: string;
  attributes: GeneratedAttribute[];
  classPathParts!: string[];
  /** @internal */
  protected _fileName!: string;

  /** @internal */
  get fileName(): string {
    return this._fileName;
  }

  constructor(options: NamedBaseOptions) {
    super(options);
    this.name = options.name;
    this.assignNamesBang(this.name);
    this.attributes = (options.attributes ?? []).map((a) => GeneratedAttribute.parse(a));
    initializeIncludedModules(this);
  }

  singularName = (): string => this.fileName;
  pluralName = (): string => pluralize(this.fileName);
  humanName = (): string => humanize(this.singularName());
  uncountable = (): boolean => this.singularName() === this.pluralName();

  indexHelper(
    this: NamedBase & { controllerClassPath(): string[] },
    { type = null }: { type?: string | null } = {},
  ): string {
    return camelize(
      compact([this.pluralRouteName(), this.uncountable() ? "index" : null, type]).join("_"),
      "lower",
    );
  }

  showHelper(
    this: NamedBase & { controllerClassPath(): string[] },
    arg: string = `this.${this.singularTableName()}`,
    { type = "url" }: { type?: string } = {},
  ): string {
    return `${camelize(`${this.singularRouteName()}_${type}`, "lower")}(${arg})`;
  }

  editHelper(
    this: NamedBase & { controllerClassPath(): string[] },
    ...args: Parameters<NamedBase["showHelper"]>
  ): string {
    return `edit${upcaseFirst(this.showHelper(...args))}`;
  }

  newHelper(
    this: NamedBase & { controllerClassPath(): string[] },
    { type = "url" }: { type?: string } = {},
  ): string {
    return camelize(`new_${this.singularRouteName()}_${type}`, "lower");
  }
  filePath = (): string => [...this.classPathParts, this.fileName].join("/");
  className = (): string =>
    [...this.classPathParts, this.fileName].map((s) => camelize(s)).join("::");
  i18nScope = (): string => this.filePath().replace(/\//g, ".");
  tableName = (): string => [...this.classPathParts, this.pluralName()].join("_");
  singularTableName = (): string => singularize(this.tableName());
  pluralTableName = (): string => this.tableName();
  pluralFileName = (): string => pluralize(this.fileName);
  fixtureFileName = (): string => this.pluralFileName();

  /** @missingRailsArgs join — PERMANENT */
  routeUrl(this: NamedBase & { controllerClassPath(): string[] }): string {
    return (
      this.controllerClassPath()
        .map((dname) => "/" + dname)
        .join("") +
      "/" +
      this.pluralFileName()
    );
  }

  modelResourceName(
    this: NamedBase & { controllerClassPath(): string[] },
    baseName: string = this.singularTableName(),
    { prefix = "" }: { prefix?: string } = {},
  ): string {
    const resourceName = `${prefix}${baseName}`;
    if ((this.options as { modelName?: string }).modelName != null) {
      return `[${this.controllerClassPath()
        .map((name) => `"${name}"`)
        .join(", ")}, ${resourceName}]`;
    } else {
      return resourceName;
    }
  }

  singularRouteName(this: NamedBase & { controllerClassPath(): string[] }): string {
    if ((this.options as { modelName?: string }).modelName != null) {
      return `${this.controllerClassPath().join("_")}_${this.singularTableName()}`;
    } else {
      return this.singularTableName();
    }
  }

  pluralRouteName(this: NamedBase & { controllerClassPath(): string[] }): string {
    if ((this.options as { modelName?: string }).modelName != null) {
      return `${this.controllerClassPath().join("_")}_${this.pluralTableName()}`;
    } else {
      return this.pluralTableName();
    }
  }

  /** @internal */
  assignNamesBang(name: string): void {
    this.classPathParts = name.includes("/") ? name.split("/") : name.split("::");
    this.classPathParts = this.classPathParts.map((p) => underscore(p));
    this._fileName = this.classPathParts.pop()!;
  }

  regularClassPath(): string[] {
    return this.classPathParts;
  }

  attributesNames(): string[] {
    const names: string[] = [];
    for (const a of this.attributes) {
      names.push(a.columnName());
      if (a.passwordDigest()) names.push("password_confirmation");
      if (a.polymorphic()) names.push(`${a.name}_type`);
    }
    return names;
  }
}
