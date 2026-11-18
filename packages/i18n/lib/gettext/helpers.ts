import { Hash } from "@blazetrails/ruby-compat";
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
  _(msgid: string, options: TranslateOptions = EMPTY_HASH): unknown {
    return Helpers.gettext(msgid, options);
  },

  sgettext(msgid: string, separator = "|"): unknown {
    let scope: string[];
    [scope, msgid] = Gettext.extractScope(msgid, separator);
    return t(msgid, { scope, default: msgid, separator });
  },
  s_(msgid: string, separator = "|"): unknown {
    return Helpers.sgettext(msgid, separator);
  },

  pgettext(msgctxt: string, msgid: string): unknown {
    const separator = Gettext.CONTEXT_SEPARATOR;
    return Helpers.sgettext([msgctxt, msgid].join(separator), separator);
  },
  p_(msgctxt: string, msgid: string): unknown {
    return Helpers.pgettext(msgctxt, msgid);
  },

  ngettext(
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
  ): unknown {
    return Helpers.nsgettext(msgid, msgidPlural, n);
  },
  n_(msgid: string | string[], msgidPlural: string | number, n: number | string = 1): unknown {
    return Helpers.ngettext(msgid, msgidPlural, n);
  },

  nsgettext(
    msgid: string | string[],
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
  ns_(
    msgid: string | string[],
    msgidPlural: string | number,
    n: number | string = 1,
    separator: unknown = "|",
  ): unknown {
    return Helpers.nsgettext(msgid, msgidPlural, n, separator);
  },

  npgettext(
    msgctxt: string,
    msgid: string | string[],
    msgidPlural: string | number,
    n: number = 1,
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

    return Helpers.nsgettext(msgid, msgidPlural, n, separator);
  },
  np_(
    msgctxt: string,
    msgid: string | string[],
    msgidPlural: string | number,
    n: number = 1,
  ): unknown {
    return Helpers.npgettext(msgctxt, msgid, msgidPlural, n);
  },
};
