import { rbObjAsString } from "@blazetrails/ruby-compat";
import { ContentLocationParser } from "../parsers/content-location-parser.js";

export class ContentLocationElement {
  readonly location: string | null;

  constructor(string: string | null) {
    this.location = ContentLocationParser.parse(string).location;
  }

  toString(..._args: unknown[]): string {
    return rbObjAsString(this.location);
  }
}
