import { Hash } from "@blazetrails/ruby-compat";
import { EMPTY_HASH, t } from "../i18n.js";
import type { TranslateOptions } from "../backend/base.js";
import { Gettext } from "../gettext.js";

const _Helpers = {
  N_(msgsid: string): string {
    return msgsid;
  },

  gettext(msgid: string, options: TranslateOptions = EMPTY_HASH): unknown {
    return t(msgid, { ...{ default: msgid, separator: "|" }, ...options });
  },

  sgettext(msgid: string | undefined, separator = "|"): unknown {
    let scope: string[];
    [scope, msgid] = Gettext.extractScope(msgid, separator);
    return t(msgid, { scope, default: msgid, separator });
  },

  pgettext(msgctxt: string, msgid: string): unknown {
    const separator = Gettext.CONTEXT_SEPARATOR;
    return this.sgettext([msgctxt, msgid].join(separator), separator);
  },

  ngettext(
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
  ): unknown {
    return this.nsgettext(msgid, msgidPlural, n);
  },

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

  npgettext(
    msgctxt: string,
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
  ): unknown {
    const separator = Gettext.CONTEXT_SEPARATOR;

    if (Array.isArray(msgid)) {
      [msgidPlural, msgid, n] = [
        msgid[1],
        [msgctxt, msgid[0]].join(separator),
        msgidPlural as number,
      ];
    } else {
      msgid = [msgctxt, msgid].join(separator);
    }

    return this.nsgettext(msgid, msgidPlural, n, separator);
  },
};

export const Helpers = {
  ..._Helpers,
  _: _Helpers.gettext,
  s_: _Helpers.sgettext,
  p_: _Helpers.pgettext,
  n_: _Helpers.ngettext,
  ns_: _Helpers.nsgettext,
  np_: _Helpers.npgettext,
};

Gettext.Helpers = Helpers;
