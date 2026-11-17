import { HTML5, type Html5DocumentFragment } from "@blazetrails/nokogiri";

import { ScrubBehavior } from "./loofah/concerns.js";
import { Scrubber, ScrubberNotFound } from "./loofah/scrubber.js";

export const Loofah = {
  Scrubber,
  ScrubberNotFound,

  html5Fragment(string: string): Html5DocumentFragment {
    return HTML5.DocumentFragment.parse(string);
  },

  scrubHtml5Fragment(stringOrIo: string, method: unknown): Html5DocumentFragment {
    return ScrubBehavior.Node.scrubBang(HTML5.DocumentFragment.parse(stringOrIo), method);
  },
};
