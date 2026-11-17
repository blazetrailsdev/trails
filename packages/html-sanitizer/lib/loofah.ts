import { HTML5, type Html5DocumentFragment } from "@blazetrails/nokogiri";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";

import { ScrubBehavior } from "./loofah/concerns.js";
import { LibxmlWorkarounds } from "./loofah/html5/libxml2-workarounds.js";
import { SafeList } from "./loofah/html5/safelist.js";
import { Scrub } from "./loofah/html5/scrub.js";
import { MetaHelpers } from "./loofah/metahelpers.js";
import { Scrubber, ScrubberNotFound } from "./loofah/scrubber.js";
import { Scrubbers } from "./loofah/scrubbers.js";
export const Loofah = {
  Scrubber,
  ScrubberNotFound,

  /** @missingRailsCall parse — CONVERGEABLE html-sanitizer-parser-concerns */
  html4Fragment(string: string): Html5DocumentFragment {
    return HTML5.DocumentFragment.parse(string);
  },

  html5Fragment(string: string): Html5DocumentFragment {
    return HTML5.DocumentFragment.parse(string);
  },

  scrubHtml5Fragment(stringOrIo: string, method: unknown): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(HTML5.DocumentFragment.parse(stringOrIo), method);
  },
};

constSet(TopLevel, "Loofah", Loofah);
constSet(Loofah, "HTML5", { SafeList, Scrub });
constSet(Loofah, "LibxmlWorkarounds", LibxmlWorkarounds);
constSet(Loofah, "MetaHelpers", MetaHelpers);
constSet(Loofah, "ScrubBehavior", ScrubBehavior);
constSet(Loofah, "Scrubbers", Scrubbers);
