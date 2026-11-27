import { HTML5, type Html5DocumentFragment } from "@blazetrails/nokogiri";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { constSet } from "@blazetrails/ruby-compat/include";

import { ScrubBehavior } from "./loofah/concerns.js";
import { LibxmlWorkarounds } from "./loofah/html5/libxml2-workarounds.js";
import { SafeList } from "./loofah/html5/safelist.js";
import { Scrub } from "./loofah/html5/scrub.js";
import { MetaHelpers } from "./loofah/metahelpers.js";
import { Scrubber, ScrubberNotFound } from "./loofah/scrubber.js";
import { Scrubbers } from "./loofah/scrubbers.js";
interface LoofahModule {
  Scrubber: typeof Scrubber;
  ScrubberNotFound: typeof ScrubberNotFound;
  HTML5: { SafeList: typeof SafeList; Scrub: typeof Scrub };
  LibxmlWorkarounds: typeof LibxmlWorkarounds;
  MetaHelpers: typeof MetaHelpers;
  ScrubBehavior: typeof ScrubBehavior;
  Scrubbers: typeof Scrubbers;
  html4Fragment(string: string): Html5DocumentFragment;
  html5Fragment(string: string): Html5DocumentFragment;
  scrubHtml5Fragment(stringOrIo: string, method: unknown): Html5DocumentFragment;
}

export const Loofah: LoofahModule = {
  Scrubber,
  ScrubberNotFound,
  HTML5: { SafeList, Scrub },
  LibxmlWorkarounds,
  MetaHelpers,
  ScrubBehavior,
  Scrubbers,

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
