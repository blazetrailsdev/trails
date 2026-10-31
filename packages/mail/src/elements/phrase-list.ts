import { PhraseListsParser } from "../parsers/phrase-lists-parser.js";
import { Utilities } from "../utilities.js";

export class PhraseList {
  readonly phrases: string[];

  constructor(string: string | null) {
    this.phrases = Utilities.isBlank(string)
      ? []
      : PhraseListsParser.parse(string).phrases.map((p: string) => Utilities.unquote(p));
  }
}
