import { isAsciiOnly, rbObjAsString, regexpEscape } from "@blazetrails/ruby-compat";
import * as Constants from "../constants.js";
import { Encodings } from "../encodings.js";
import { IndifferentHash } from "../indifferent-hash.js";
import { Utilities } from "../utilities.js";

export class ParameterHash extends IndifferentHash<unknown> {
  override get(keyName: string): unknown {
    const keyPattern = new RegExp(`^${regexpEscape(rbObjAsString(keyName))}(\\*|$)`, "im");
    const pairs: [string, unknown][] = [];
    let exact: string | null = null;

    for (const [k, v] of this.entries()) {
      const m = keyPattern.exec(k);
      if (m) {
        if (m[1] === Constants.ASTERISK) {
          pairs.push([k, v]);
        } else {
          exact = k;
        }
      }
    }

    if (pairs.length === 0) {
      const key = exact ?? keyName;
      return this.has(key) ? super.get(key) : (this.default(key) ?? null);
    } else {
      let string = pairs
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map((v) => v[1])
        .join("");
      let encoding: string | null;
      const mt = /([\w-]+)?'(\w\w)?'(.*)/.exec(string);
      if (mt) {
        string = mt[3];
        encoding = mt[1] ?? null;
      } else {
        encoding = null;
      }
      return Encodings.paramDecode(string, encoding);
    }
  }

  encoded(): string {
    return [...this.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([keyName, value]) => {
        if (!isAsciiOnly(value as string)) {
          value = Encodings.paramEncode(value as string);
          keyName = `${keyName}*`;
        }
        return `${keyName}=${Utilities.quoteToken(value as string)}`;
      })
      .join(";\r\n ");
  }

  decoded(): string {
    return [...this.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([keyName, value]) => `${keyName}=${Utilities.quoteToken(value as string)}`)
      .join("; ");
  }
}
