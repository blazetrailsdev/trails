import { File } from "@blazetrails/ruby-compat/file";
import { Hash } from "@blazetrails/ruby-compat/hash";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { rbInspect } from "@blazetrails/ruby-compat/object";
import { stringSplit } from "@blazetrails/ruby-compat/string/split";

import { Gettext as I18nGettext } from "../gettext.js";
import { PoParser } from "../gettext/po-parser.js";
import type { Locale } from "../locale.js";
import * as Utils from "../utils.js";
import type { TranslationData } from "../utils.js";
import { _readFile } from "./base.js";

export class PoData extends Hash<string, string> {
  setComment(_msgidOrSym: string, _comment: string): void {}
}

interface GettextHost {
  parse(filename: string): PoData;
  normalize(locale: Locale, data: PoData): TranslationData;
  normalizePluralization(locale: Locale, key: string, value: string): [string, TranslationData];
}

export const Gettext = {
  PoData,

  /** @internal */
  loadPo(this: GettextHost, filename: string): [unknown, boolean] {
    const locale = File.basename(filename, ".po");
    const data = this.normalize(locale, this.parse(filename));
    return [new Hash().set(locale, data), false];
  },

  /** @internal */
  parse(filename: string): PoData {
    return new PoParser().parse(_readFile(filename), new PoData());
  },

  /** @internal */
  normalize(this: GettextHost, locale: Locale, data: PoData): TranslationData {
    const result: TranslationData = new Hash();
    for (let [key, value] of data as Map<string, unknown>) {
      if (!(key == null || key.length === 0)) {
        key = key.replaceAll(I18nGettext.CONTEXT_SEPARATOR, "|");
        if (key.includes("\u0000"))
          [key, value] = this.normalizePluralization(locale, key, value as string);

        const parts = stringSplit(key, "|").reverse();
        let normalized: TranslationData = new Hash();
        for (const part of parts) {
          normalized = new Hash().set(part, normalized.size === 0 ? value : normalized);
        }

        Utils.deepMergeBang(result, normalized);
      }
    }
    return result;
  },

  /** @internal */
  normalizePluralization(locale: Locale, key: string, value: string): [string, TranslationData] {
    key =
      stringSplit(
        key.replaceAll("\u0000", I18nGettext.PLURAL_SEPARATOR),
        I18nGettext.PLURAL_SEPARATOR,
      )[0] ?? null;

    const keys = I18nGettext.pluralKeys(locale);
    const values = stringSplit(value, "\u0000");
    if (values.length !== keys.length)
      throw new RuntimeError(
        `invalid number of plurals: ${values.length}, keys: ${rbInspect(keys)} on ${locale} locale for msgid ${rbInspect(key)} with values ${rbInspect(values)}`,
      );

    const result: TranslationData = new Hash();
    values.forEach((_value, ix) => result.set(keys[ix], _value));
    return [key, result];
  },
};
