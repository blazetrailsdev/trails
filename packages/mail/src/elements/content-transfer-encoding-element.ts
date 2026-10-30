import { ContentTransferEncodingParser } from "../parsers/content-transfer-encoding-parser.js";

export class ContentTransferEncodingElement {
  encoding: string;

  constructor(string: string | null) {
    this.encoding = ContentTransferEncodingParser.parse(string).encoding;
  }
}
