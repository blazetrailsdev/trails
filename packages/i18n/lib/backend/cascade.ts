import { defineModule, isPlainHash, rbCallSuper } from "@blazetrails/ruby-compat";

import { EMPTY_HASH, defaultSeparator, normalizeKeys, type TranslationKey } from "../i18n.js";
import type { Locale } from "../locale.js";
import type { TranslateOptions } from "./base.js";

function lookup(
  this: object,
  locale: Locale,
  key: TranslationKey,
  scope: unknown = [],
  options: TranslateOptions = EMPTY_HASH,
): unknown {
  let cascade = options.cascade as Record<string, unknown> | null | undefined | false;
  if (cascade == null || cascade === false)
    return rbCallSuper(this, lookup, locale, key, scope, options);

  if (!isPlainHash(cascade)) cascade = { step: 1 };
  const step = (cascade.step != null && cascade.step !== false ? cascade.step : 1) as number;
  const offset = (
    cascade.offset != null && cascade.offset !== false ? cascade.offset : 1
  ) as number;
  const separator = (
    options.separator != null && options.separator !== false
      ? options.separator
      : defaultSeparator()
  ) as string;
  const skipRoot = Object.hasOwn(cascade, "skipRoot") ? cascade.skipRoot : true;

  scope = normalizeKeys(null, key, scope, separator);
  let keys = scope as TranslationKey[];
  key = (offset <= keys.length ? keys.splice(-offset, offset) : []).join(separator);

  do {
    const result = rbCallSuper(this, lookup, locale, key, scope, options);
    if (result != null) return result;
    scope = keys = [...keys];
  } while (
    (keys.length !== 0 || !(skipRoot != null && skipRoot !== false)) &&
    keys.length !== 0 &&
    step <= keys.length &&
    keys.splice(-step, step)
  );
  return null;
}

export const Cascade = defineModule({ lookup });
