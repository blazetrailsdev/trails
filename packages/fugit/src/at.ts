import { StandardError, classModule, rbSetClassPathString } from "@blazetrails/ruby-compat";
import { EtOrbi, type EoTime } from "@blazetrails/et-orbi";
import { Fugit } from "./namespaces.js";

export class At {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static parse(s: unknown): EoTime | null {
    try {
      return EtOrbi.makeTime(s);
    } catch (e) {
      if (e instanceof StandardError || e instanceof TypeError) return null;
      throw e;
    }
  }

  static doParse(s: unknown): EoTime {
    return EtOrbi.makeTime(s);
  }
}

Fugit.At = At;
rbSetClassPathString(At, Fugit, "At");
