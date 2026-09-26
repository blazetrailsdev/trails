import {
  underscore,
  camelize,
  pluralize,
  singularize,
  humanize,
  initializeIncludedModules,
} from "@blazetrails/activesupport";
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
  fileName!: string;

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
  filePath = (): string => [...this.classPathParts, this.fileName].join("/");
  className = (): string =>
    [...this.classPathParts, this.fileName].map((s) => camelize(s)).join("::");
  i18nScope = (): string => this.filePath().replace(/\//g, ".");
  tableName = (): string => [...this.classPathParts, this.pluralName()].join("_");
  singularTableName = (): string => singularize(this.tableName());
  pluralTableName = (): string => this.tableName();
  pluralFileName = (): string => pluralize(this.fileName);
  fixtureFileName = (): string => this.pluralFileName();

  routeUrl(this: NamedBase & { controllerClassPath(): string[] }): string {
    return (
      this.controllerClassPath()
        .map((dname) => "/" + dname)
        .join("") +
      "/" +
      this.pluralFileName()
    );
  }

  /** @internal */
  assignNamesBang(name: string): void {
    this.classPathParts = name.includes("/") ? name.split("/") : name.split("::");
    this.classPathParts = this.classPathParts.map((p) => underscore(p));
    this.fileName = this.classPathParts.pop()!;
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
