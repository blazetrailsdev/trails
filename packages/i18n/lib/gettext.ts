import { Helpers } from "./gettext/helpers.js";

const _pluralKeys: Record<string, string[]> = { en: ["one", "other"] };

export const Gettext = {
  PLURAL_SEPARATOR: "\u0001",
  CONTEXT_SEPARATOR: "\u0004",

  Helpers,

  pluralKeys: ((...args: string[]) =>
    args.length === 0 ? _pluralKeys : (_pluralKeys[args[0]] ?? _pluralKeys.en)) as {
    (): Record<string, string[]>;
    (...args: string[]): string[];
  },

  extractScope(msgid: unknown, separator: string): [string[], string] {
    const scope = String(msgid ?? "").split(separator);
    msgid = scope.pop();
    return [scope, msgid as string];
  },
};
