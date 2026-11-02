import type { Encoding } from "@blazetrails/ruby-compat";
import { ContentDispositionElement } from "../elements/content-disposition-element.js";
import { Mail } from "../mail.js";
import { NamedStructuredField } from "./named-structured-field.js";
import { ParameterHash } from "./parameter-hash.js";

export class ContentDispositionField extends NamedStructuredField {
  static readonly NAME = "Content-Disposition";

  /** @internal */
  declare private _filename: unknown;

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super(ContentDispositionField.prototype.ensureFilenameQuoted(value), charset);
  }

  override element(): ContentDispositionElement {
    return (this._element ??= new ContentDispositionElement(
      this.value as string,
    )) as ContentDispositionElement;
  }

  dispositionType(): string {
    return this.element().dispositionType;
  }

  parameters(): ParameterHash {
    const parameters = new ParameterHash();
    for (const p of this.element().parameters ?? []) parameters.update(p);
    return parameters;
  }

  filename(): unknown {
    return (this._filename ??= this.parameters().get("filename") ?? this.parameters().get("name"));
  }

  override encoded(): string {
    const p = this.parameters().size > 0 ? `;\r\n ${this.parameters().encoded()}` : "";
    return `${this.name}: ${this.dispositionType()}${p}\r\n`;
  }

  override decoded(): string {
    const p = this.parameters().size > 0 ? `; ${this.parameters().decoded()}` : "";
    return `${this.dispositionType()}${p}`;
  }
}
Mail.ContentDispositionField = ContentDispositionField;
