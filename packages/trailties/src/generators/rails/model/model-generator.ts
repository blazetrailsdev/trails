import { camelize } from "@blazetrails/activesupport";
import { tsClass, tsField, tsImport, tsModule } from "../../../template-builder/index.js";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { normalizeModelName, type ModelHelpersOptions } from "../../model-helpers.js";

// Mirrors railties/lib/rails/generators/rails/model/model_generator.rb.
// hook_for :orm → direct Base emit; Admin::User flattens to AdminUser for TS.
export interface ModelGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {}

// prettier-ignore
const TS_TYPES: Record<string, string> = { integer: "number", float: "number",
  decimal: "number", boolean: "boolean", date: "Date", datetime: "Date",
  timestamp: "Date", time: "Date", references: "number", belongs_to: "number",
  binary: "Uint8Array", digest: "string" };

export function emitModelSource(className: string, fields: Array<[string, string]>): string {
  const { refs } = tsImport("@blazetrails/activerecord", { Base: "named" });
  return tsModule({
    declarations: [
      tsClass({
        name: className,
        extends: refs.Base,
        body: fields.map(([name, type]) => tsField(name, type, { definite: true })),
      }),
    ],
  });
}

export class ModelGenerator extends NamedBase {
  constructor(options: ModelGeneratorOptions) {
    const normalized = normalizeModelName(options.name, options, options.output);
    super({ ...options, name: normalized });
  }

  run(): string[] {
    const filename = `app/models/${this.filePath()}${this.ext()}`;
    const className = [...this.classPathParts, this.fileName].map((p) => camelize(p)).join("");
    const fields: Array<[string, string]> = this.attributes
      .filter((a) => !a.virtual())
      .map((a) => [a.columnName(), TS_TYPES[a.type] ?? "string"]);
    this.createFile(filename, emitModelSource(className, fields));
    return this.getCreatedFiles();
  }
}
