import { stringSplit } from "@blazetrails/ruby-compat/string/split";
import { toS } from "@blazetrails/ruby-compat/object";
import type { Helpers } from "./gettext/helpers.js";

const _pluralKeys: Record<string, string[]> = { en: ["one", "other"] };

interface Gettext {
  PLURAL_SEPARATOR: string;
  CONTEXT_SEPARATOR: string;
  Helpers?: typeof Helpers;
  pluralKeys(): Record<string, string[]>;
  pluralKeys(...args: string[]): string[];
  extractScope(msgid: unknown, separator: string): [string[], string | undefined];
}

export const Gettext: Gettext = {
  PLURAL_SEPARATOR: "\u0001",
  CONTEXT_SEPARATOR: "\u0004",

  pluralKeys(...args: string[]): never {
    return (args.length === 0 ? _pluralKeys : (_pluralKeys[args[0]] ?? _pluralKeys.en)) as never;
  },

  extractScope(msgid: unknown, separator: string): [string[], string | undefined] {
    const scope = stringSplit(toS(msgid), separator);
    msgid = scope.pop();
    return [scope, msgid as string | undefined];
  },
};
