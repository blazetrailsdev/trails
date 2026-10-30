import { ContentTypeParser } from "../parsers/content-type-parser.js";

export class ContentTypeElement {
  mainType: string;
  subType: string;
  parameters: Record<string, string>[];

  constructor(string: string | null) {
    const contentType = ContentTypeParser.parse(this.cleaned(string));
    this.mainType = contentType.mainType;
    this.subType = contentType.subType;
    this.parameters = contentType.parameters;
  }

  /** @internal */
  private cleaned(string: string | null): string | null {
    const match = string == null ? null : /;\s*(?=\n|(?![\s\S]))/.exec(string);
    if (match) {
      return string!.slice(0, match.index);
    } else {
      return string;
    }
  }
}
