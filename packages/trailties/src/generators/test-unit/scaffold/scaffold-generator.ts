/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rails::Generators::ResourceHelpers` (`test_unit/scaffold/scaffold_generator.rb:9`); the class/interface merge is how a mixin surfaces on the type side. */
import { include, type Included } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { dasherize } from "../../base.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { ResourceHelpers } from "../../resource-helpers.js";
import { TEMPLATES } from "./templates.js";

export interface ScaffoldGenerator extends Included<typeof ResourceHelpers> {}

export class ScaffoldGenerator extends NamedBase {
  /** @internal */
  declare controllerName: string;
  /** @internal */
  declare controllerFileName: string;
  /** @internal */
  declare _controllerClassPath: string[];
  declare options: NamedBaseOptions & { api?: boolean };
  /** @internal */
  _fixtureName?: string;

  createTestFiles(): void {
    const templateFile = this.options.api ? "api_functional_test" : "functional_test";
    this.createFile(
      File.join(
        "test/controllers",
        ...this.controllerClassPath(),
        `${dasherize(this.controllerFileName)}-controller.test${this.ext()}`,
      ),
      TEMPLATES[templateFile].call(this),
    );
  }

  fixtureName(): string {
    return (this._fixtureName ??= this.tableName());
  }

  run(): string[] {
    this.createTestFiles();
    return this.getCreatedFiles();
  }

  /** @internal */
  attributesString(): string {
    const attributesHash = this.attributesHash();
    if (Object.keys(attributesHash).length === 0) {
      return "{}";
    } else {
      return `{ ${Object.entries(attributesHash)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")} }`;
    }
  }

  /** @internal */
  attributesHash(): Record<string, string> {
    if (this.attributesNames().length === 0) return {};

    const pairs: [string, string][] = [];
    for (const name of this.attributesNames()) {
      if (
        ["password", "password_confirmation"].includes(name) &&
        this.attributes.some((a) => a.passwordDigest())
      ) {
        pairs.push([name, '"secret"']);
      } else if (!this.isVirtual(name)) {
        pairs.push([name, `t["@${this.singularTableName()}"].${name}`]);
      }
    }
    return Object.fromEntries(pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** @internal */
  isVirtual(name: string): boolean {
    const attribute = this.attributes.find((attr) => attr.name === name);
    return attribute?.virtual() ?? false;
  }
}

include(ScaffoldGenerator, ResourceHelpers);
