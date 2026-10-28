import { dasherize } from "../../base.js";
import { NamedBase } from "../../named-base.js";
import { camelize, underscore } from "@blazetrails/activesupport";

export class HelperGenerator extends NamedBase {
  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  createHelperFiles(): void {
    const paths = helperPaths(this.name);

    this.createFile(
      `app/helpers/${paths.helperFile}${this.ext()}`,
      `export const ${paths.helperName} = {\n};\n`,
    );
  }
}

Object.defineProperty(HelperGenerator, "name", { value: "Rails::Generators::HelperGenerator" });
HelperGenerator.checkClassCollision({ suffix: "Helper" });
HelperGenerator.methodAdded("createHelperFiles");
HelperGenerator.hookFor("testFramework");

export interface HelperPaths {
  helperName: string;
  helperFile: string;
  namespaceParts: string[];
}

export function helperPaths(name: string): HelperPaths {
  const stripped = name.replace(/[_-]?helper$/i, "");
  const parts = stripped.split("/");
  const leaf = parts[parts.length - 1];
  const helperName =
    parts.length > 1
      ? parts.map((p) => camelize(underscore(p))).join("") + "Helper"
      : camelize(underscore(leaf)) + "Helper";
  const helperFile =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/") + "-helper"
      : dasherize(underscore(leaf)) + "-helper";
  return { helperName, helperFile, namespaceParts: parts };
}
