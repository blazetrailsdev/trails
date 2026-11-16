import {
  ARRAY_METHOD_TABLE,
  Hash,
  isSymbol,
  rbObjAsString as toS,
  rbObjClass,
  rbObjClassname,
  rbObjIsKindOf,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { assertValidKeys } from "../../hash-utils.js";
import { I18n } from "../../i18n.js";
import { camelize, pluralize, singularize, underscore } from "../../inflector.js";
import * as XmlMini from "../../xml-mini.js";

export function toSentence(
  array: readonly unknown[],
  options: {
    wordsConnector?: string;
    twoWordsConnector?: string;
    lastWordConnector?: string;
    locale?: string | false;
  } = {},
): string {
  assertValidKeys(options, ["wordsConnector", "twoWordsConnector", "lastWordConnector", "locale"]);

  const defaultConnectors: Record<string, string> = {
    wordsConnector: ", ",
    twoWordsConnector: " and ",
    lastWordConnector: ", and ",
  };
  if (options.locale !== false) {
    const i18nConnectors = I18n.translate("support.array", {
      locale: options.locale ?? null,
      default: {},
    }) as Record<string, string> | Map<unknown, string>;
    for (const [k, v] of i18nConnectors instanceof Map
      ? i18nConnectors
      : Object.entries(i18nConnectors)) {
      defaultConnectors[camelize(isSymbol(k) ? symbolToS(k) : String(k), "lower")] = v;
    }
  }
  options = Object.assign(defaultConnectors, options);

  switch (array.length) {
    case 0:
      return "";
    case 1:
      return `${array[0]}`;
    case 2:
      return `${array[0]}${options.twoWordsConnector ?? ""}${array[1]}`;
    default:
      return `${array.slice(0, -1).join(options.wordsConnector ?? "")}${options.lastWordConnector ?? ""}${array.at(-1)}`;
  }
}

export function toFs(self: unknown[], format = "default"): string {
  switch (format) {
    case "db":
      if (self.length === 0) {
        return "null";
      } else {
        return self.map((e) => (e as { id: unknown }).id).join(",");
      }
    default:
      return toS(self);
  }
}

export { toFs as toFormattedS };

/** @missingRailsName name — PERMANENT */
export function toXml(
  self: unknown[],
  options: XmlMini.ToXmlOptions = {},
  block?: (builder: XmlMini.XmlBuilder) => void,
): string {
  options = { ...options };
  options.indent ??= 2;
  options.builder ??= new XmlMini.IndentedXmlStringBuilder("", options.indent);
  options.root ??= (() => {
    const first = self[0];
    if (rbObjClass(first) !== Hash && self.every((e) => rbObjIsKindOf(e, rbObjClass(first)))) {
      const underscored = underscore(rbObjClassname(first));
      return pluralize(underscored).replaceAll("/", "_");
    } else {
      return "objects";
    }
  })();

  const builder = options.builder;
  const skipInstruct = options.skipInstruct;
  delete options.skipInstruct;
  if (!skipInstruct) builder.instruct();

  const root = XmlMini.renameKey(String(options.root), options);
  const children = options.children ?? singularize(root);
  delete options.children;
  const attributes: Record<string, string> = options.skipTypes ? {} : { type: "array" };

  if (self.length === 0) {
    builder.tag(root, null, attributes);
  } else {
    builder.openTag(root, attributes);
    for (const value of self) {
      XmlMini.toTag(children, value, options as XmlMini.ToTagOptions);
    }
    if (block) block(builder);
    builder.closeTag(root);
  }
  return builder.target();
}

const toFormattedS = toFs;
Object.assign(ARRAY_METHOD_TABLE, { toSentence, toFs, toFormattedS, toXml });
