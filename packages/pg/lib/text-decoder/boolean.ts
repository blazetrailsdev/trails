import { TypeError } from "@blazetrails/ruby-compat";
import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Boolean extends SimpleDecoder {
  decode(string: string, tuple: number | null = null, field: number | null = null): unknown {
    if (string.length < 1) {
      throw new TypeError(
        `wrong data for text boolean converter in tuple ${tuple ?? -1} field ${field ?? -1}`,
      );
    }
    return string[0] === "t";
  }
}

PG.TextDecoder.Boolean = Boolean;
