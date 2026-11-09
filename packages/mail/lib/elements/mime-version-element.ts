import { MimeVersionParser } from "../parsers/mime-version-parser.js";

export class MimeVersionElement {
  readonly major: string;
  readonly minor: string;

  constructor(string: string | null) {
    const mimeVersion = MimeVersionParser.parse(string);
    this.major = mimeVersion.major;
    this.minor = mimeVersion.minor;
  }
}
