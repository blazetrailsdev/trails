import { StandardError, classModule } from "@blazetrails/ruby-compat";
import { EtOrbi, type EoTime } from "@blazetrails/et-orbi";
import { Fugit } from "./namespaces.js";

export class At {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static toString(): string {
    return "Fugit::At";
  }

  static parse(s: unknown): EoTime | null {
    try {
      return EtOrbi.makeTime(s);
    } catch (e) {
      if (e instanceof StandardError) return null;
      throw e;
    }
  }

  static doParse(s: unknown): EoTime {
    return EtOrbi.makeTime(s);
  }
}

Fugit.At = At;
