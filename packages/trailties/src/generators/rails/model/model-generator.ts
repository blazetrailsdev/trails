import { camelize } from "@blazetrails/activesupport";
import { NamedBase, type NamedBaseOptions } from "../../named-base.js";
import { normalizeModelName, type ModelHelpersOptions } from "../../model-helpers.js";

// Mirrors railties/lib/rails/generators/rails/model/model_generator.rb.
// Rails' `hook_for :orm, required: true` is replaced with a direct ORM-
// agnostic emit; a future PR can dispatch to per-ORM templates.
export interface ModelGeneratorOptions extends NamedBaseOptions, ModelHelpersOptions {}

export class ModelGenerator extends NamedBase {
  constructor(options: ModelGeneratorOptions) {
    const normalized = normalizeModelName(options.name, options, options.output);
    super({ ...options, name: normalized });
  }

  run(): string[] {
    const ext = this.ext();
    const filename = `app/models/${this.filePath()}${ext}`;
    const className = camelize(this.fileName);
    const attrs = this.attributes.map((a) => `  ${a.columnName()}!: ${tsType(a.type)};`).join("\n");
    this.createFile(
      filename,
      `import { Model } from "@blazetrails/activerecord";

export class ${className} extends Model {
${attrs}
}
`,
    );
    return this.getCreatedFiles();
  }
}

function tsType(t: string): string {
  if (t === "integer" || t === "float" || t === "decimal") return "number";
  if (t === "boolean") return "boolean";
  if (t === "date" || t === "datetime" || t === "timestamp" || t === "time") return "Date";
  if (t === "references" || t === "belongs_to") return "number";
  return "string";
}
