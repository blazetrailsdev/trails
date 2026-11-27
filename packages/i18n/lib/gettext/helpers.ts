import { Hash } from "@blazetrails/ruby-compat/hash";
import { EMPTY_HASH, t } from "../i18n.js";
import type { TranslateOptions } from "../backend/base.js";
import { Gettext } from "../gettext.js";

export const Helpers = {
  N_(msgsid: string): string {
    return msgsid;
  },

  gettext(msgid: string, options: TranslateOptions = EMPTY_HASH): unknown {
    return t(msgid, { ...{ default: msgid, separator: "|" }, ...options });
  },
  _: undefined as unknown as (msgid: string, options?: TranslateOptions) => unknown,

  sgettext(msgid: string | undefined, separator = "|"): unknown {
    let scope: string[];
    [scope, msgid] = Gettext.extractScope(msgid, separator);
    return t(msgid, { scope, default: msgid, separator });
  },
  s_: undefined as unknown as (msgid: string | undefined, separator?: string) => unknown,

  pgettext(msgctxt: string, msgid: string): unknown {
    const separator = Gettext.CONTEXT_SEPARATOR;
    return this.sgettext([msgctxt, msgid].join(separator), separator);
  },
  p_: undefined as unknown as (msgctxt: string, msgid: string) => unknown,

  ngettext(
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
  ): unknown {
    return this.nsgettext(msgid, msgidPlural, n);
  },
  n_: undefined as unknown as (
    msgid: string | string[],
    msgidPlural: string | number,
    n?: number | string,
  ) => unknown,

  nsgettext(
    msgid: string | string[] | undefined,
    msgidPlural: string | number,
    n: number | string = 1,
    separator: unknown = "|",
  ): unknown {
    if (Array.isArray(msgid)) {
      [msgid, msgidPlural, n, separator] = [msgid[0], msgid[1], msgidPlural, n];
      if (typeof separator !== "string") separator = "|";
    }

    let scope: string[];
    [scope, msgid] = Gettext.extractScope(msgid, separator as string);
    const default_ = new Hash<string, unknown>().set(":one", msgid).set(":other", msgidPlural);
    return t(msgid, { default: default_, count: n, scope, separator });
  },
  ns_: undefined as unknown as (
    msgid: string | string[] | undefined,
    msgidPlural: string | number,
    n?: number | string,
    separator?: unknown,
  ) => unknown,

  npgettext(
    msgctxt: string,
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
  ): unknown {
    const separator = Gettext.CONTEXT_SEPARATOR;

    if (Array.isArray(msgid)) {
      [msgidPlural, msgid, n] = [msgid[1], [msgctxt, msgid[0]].join(separator), msgidPlural];
    } else {
      msgid = [msgctxt, msgid].join(separator);
    }

    return this.nsgettext(msgid, msgidPlural, n, separator);
  },
  np_: undefined as unknown as (
    msgctxt: string,
    msgid: string | string[],
    msgidPlural: string | number,
    n?: number | string,
  ) => unknown,
};

Helpers._ = Helpers.gettext;
Helpers.s_ = Helpers.sgettext;
Helpers.p_ = Helpers.pgettext;
Helpers.n_ = Helpers.ngettext;
Helpers.ns_ = Helpers.nsgettext;
Helpers.np_ = Helpers.npgettext;

Gettext.Helpers = Helpers;
