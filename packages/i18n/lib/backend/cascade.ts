import { isPlainHash } from "@blazetrails/ruby-compat/object";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";

import { EMPTY_HASH, defaultSeparator, normalizeKeys, type TranslationKey } from "../i18n.js";
import type { Locale } from "../locale.js";
import type { TranslateOptions } from "./base.js";

export const Cascade = {
  lookup(
    this: object,
    locale: Locale,
    key: TranslationKey,
    scope: TranslationKey | TranslationKey[] | null = [],
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    let cascade = options.cascade as Record<string, unknown> | null | undefined | false;
    if (cascade == null || cascade === false)
      return rbCallSuper(this, Cascade.lookup, locale, key, scope, options);

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
    key = (offset <= scope.length ? scope.splice(-offset, offset) : []).join(separator);

    do {
      const result = rbCallSuper(this, Cascade.lookup, locale, key, scope, options);
      if (result != null) return result;
      scope = [...scope];
    } while (
      (scope.length !== 0 || !(skipRoot != null && skipRoot !== false)) &&
      (step <= scope.length ? scope.splice(-step, step) : null)
    );
    return null;
  },
};
