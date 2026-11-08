import { ContentDispositionParser } from "../parsers/content-disposition-parser.js";

export class ContentDispositionElement {
  readonly dispositionType: string;
  readonly parameters: Record<string, string>[];

  constructor(string: string | null) {
    const contentDisposition = ContentDispositionParser.parse(this.cleaned(string));
    this.dispositionType = contentDisposition.dispositionType;
    this.parameters = contentDisposition.parameters;
  }

  /** @internal */
  private cleaned(string: string | null): string | null {
    const match = string == null ? null : /([^\n]+);\s*(?=\n|(?![\s\S]))/.exec(string);
    return match ? match[1] : string;
  }
}
