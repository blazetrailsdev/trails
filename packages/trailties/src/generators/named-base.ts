import { underscore, camelize, pluralize, singularize, humanize } from "@blazetrails/activesupport";
import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { GeneratedAttribute } from "./generated-attribute.js";

export interface NamedBaseOptions extends GeneratorOptions {
  name: string;
  attributes?: string[];
}

export class NamedBase extends GeneratorBase {
  name: string;
  attributes: GeneratedAttribute[];
  classPathParts: string[];
  fileName: string;

  constructor(options: NamedBaseOptions) {
    super(options);
    this.name = options.name;
    const parts = this.name.includes("/") ? this.name.split("/") : this.name.split("::");
    const underscored = parts.map((p) => underscore(p));
    this.fileName = underscored.pop()!;
    this.classPathParts = underscored;
    this.attributes = (options.attributes ?? []).map((a) => GeneratedAttribute.parse(a));
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
