import { humanize, pluralize, singularize } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

export class GeneratorError extends Error {}

export type AttrOptions = Record<string, unknown>;
export type IndexType = "index" | "uniq" | undefined;

const INDEX_OPTIONS = ["index", "uniq"];
const UNIQ_INDEX_OPTIONS = ["uniq"];
const DEFAULT_TYPES = new Set(
  "attachment attachments belongs_to boolean date datetime decimal digest float integer references rich_text string text time timestamp token".split(
    " ",
  ),
);
const DANGEROUS = new Set(["id", "type", "save", "destroy", "errors", "attributes"]);
const FIELD_TYPES = Object.fromEntries(
  "integer:number_field time:time_field datetime:datetime_field timestamp:datetime_field date:date_field text:textarea rich_text:rich_textarea boolean:checkbox attachment:file_field attachments:file_field"
    .split(" ")
    .map((p) => p.split(":")),
);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dbTimeString(dt: Temporal.PlainDateTime): string {
  return `${dt.year}-${pad2(dt.month)}-${pad2(dt.day)} ${pad2(dt.hour)}:${pad2(dt.minute)}:${pad2(dt.second)}`;
}

function dbDateString(d: Temporal.PlainDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

export class GeneratedAttribute {
  name: string;
  type: string;
  attrOptions: AttrOptions;
  private _hasIndex: boolean;
  private _hasUniqIndex: boolean;
  private _default: string | number | boolean | null | undefined = undefined;

  static parse(columnDefinition: string): GeneratedAttribute {
    const [name, rawType, rawIndex] = columnDefinition.split(":");
    let type: string | undefined = rawType;
    let indexType: string | undefined = rawIndex;
    if (type && GeneratedAttribute.validIndexType(type)) {
      indexType = type;
      type = undefined;
    }
    const [parsedType, opts] = parseTypeAndOptions(type);
    const finalType = parsedType ?? "string";
    if (DANGEROUS.has(name!)) {
      throw new GeneratorError(
        `Could not generate field '${name}', as it is already defined by Active Record.`,
      );
    }
    if (parsedType && !GeneratedAttribute.validType(parsedType)) {
      throw new GeneratorError(
        `Could not generate field '${name}' with unknown type '${parsedType}'.`,
      );
    }
    if (indexType && !GeneratedAttribute.validIndexType(indexType)) {
      throw new GeneratorError(
        `Could not generate field '${name}' with unknown index '${indexType}'.`,
      );
    }
    if (parsedType && GeneratedAttribute.reference(finalType) && indexType === "uniq") {
      opts.index = { unique: true };
    }
    return new GeneratedAttribute(name!, finalType, indexType as IndexType, opts);
  }

  static validType = (t: string): boolean => DEFAULT_TYPES.has(t);
  static validIndexType = (t: string | undefined): boolean => INDEX_OPTIONS.includes(t ?? "");
  static reference = (t: string): boolean => t === "references" || t === "belongs_to";

  constructor(name: string, type = "string", indexType?: IndexType, attrOptions: AttrOptions = {}) {
    this.name = name;
    this.type = type;
    this._hasIndex = INDEX_OPTIONS.includes(indexType ?? "");
    this._hasUniqIndex = UNIQ_INDEX_OPTIONS.includes(indexType ?? "");
    this.attrOptions = attrOptions;
  }

  default(): string | number | boolean | null {
    if (this._default !== undefined) return this._default;
    switch (this.type) {
      case "integer":
        return (this._default = 1);
      case "float":
        return (this._default = 1.5);
      case "decimal":
        return (this._default = "9.99");
      case "datetime":
      case "timestamp":
      case "time":
        return (this._default = dbTimeString(Temporal.Now.plainDateTimeISO()));
      case "date":
        return (this._default = dbDateString(Temporal.Now.plainDateISO()));
      case "string":
        return (this._default = this.name === "type" ? "" : "MyString");
      case "text":
        return (this._default = "MyText");
      case "boolean":
        return (this._default = false);
      case "references":
      case "belongs_to":
      case "attachment":
      case "attachments":
      case "rich_text":
        return (this._default = null);
      default:
        return (this._default = "");
    }
  }

  humanName = (): string => humanize(this.name);
  pluralName = (): string => pluralize(this.name.replace(/_id$/, ""));
  singularName = (): string => singularize(this.name.replace(/_id$/, ""));
  columnName = (): string => (this.reference() ? `${this.name}_id` : this.name);
  indexName = (): string | string[] =>
    this.polymorphic() ? [`${this.name}_id`, `${this.name}_type`] : this.columnName();
  foreignKey = (): boolean => this.name.endsWith("_id");
  reference = (): boolean => GeneratedAttribute.reference(this.type);
  polymorphic = (): boolean => Boolean(this.attrOptions.polymorphic);
  hasIndex = (): boolean => this._hasIndex;
  hasUniqIndex = (): boolean => this._hasUniqIndex;
  passwordDigest = (): boolean => this.name === "password" && this.type === "digest";
  token = (): boolean => this.type === "token";
  richText = (): boolean => this.type === "rich_text";
  attachment = (): boolean => this.type === "attachment";
  attachments = (): boolean => this.type === "attachments";
  virtual = (): boolean => this.richText() || this.attachment() || this.attachments();

  fieldType(): string {
    return FIELD_TYPES[this.type] ?? "text_field";
  }

  toString(): string {
    const opts = printOptions(this.attrOptions);
    if (this.hasUniqIndex()) return `${this.name}:${this.type}${opts}:uniq`;
    if (this.hasIndex()) return `${this.name}:${this.type}${opts}:index`;
    return `${this.name}:${this.type}${opts}`;
  }
}

function parseTypeAndOptions(type: string | undefined): [string | undefined, AttrOptions] {
  if (!type) return [undefined, {}];
  let parsedType: string | undefined;
  const opts: AttrOptions = {};
  let m: RegExpMatchArray | null;
  if ((m = type.match(/^(text|binary)\{([a-z]+)\}$/))) [parsedType, opts.size] = [m[1], m[2]];
  else if ((m = type.match(/^(string|text|binary|integer)\{(\d+)\}$/))) {
    [parsedType, opts.limit] = [m[1], parseInt(m[2]!, 10)];
  } else if ((m = type.match(/^decimal\{(\d+)[,.-](\d+)\}$/))) {
    parsedType = "decimal";
    opts.precision = parseInt(m[1]!, 10);
    opts.scale = parseInt(m[2]!, 10);
  } else if ((m = type.match(/^(references|belongs_to)\{(.+)\}$/))) {
    parsedType = m[1];
    for (const o of m[2]!.split(/[,.-]/)) opts[o] = true;
  } else parsedType = type.replace(/!/g, "");
  if (type.endsWith("!")) opts.null = false;
  return [parsedType, opts];
}

function printOptions(opts: AttrOptions): string {
  const k = Object.keys(opts);
  if (k.length === 0) return "";
  if (opts.size) return `{${opts.size}}`;
  if (opts.limit != null) return `{${opts.limit}}`;
  if (opts.precision != null && opts.scale != null) return `{${opts.precision},${opts.scale}}`;
  return `{${k.join(",")}}`;
}
