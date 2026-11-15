import { MimeVersionParser } from "../parsers/mime-version-parser.js";

export class MimeVersionElement {
  readonly major: string;
  readonly minor: string | null;

  constructor(string: string | null) {
    const mimeVersion = MimeVersionParser.parse(string);
    this.major = mimeVersion.major;
    this.minor = mimeVersion.minor;
  }
}
