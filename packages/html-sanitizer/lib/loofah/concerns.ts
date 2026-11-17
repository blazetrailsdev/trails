import { HTML5, type Html5DocumentFragment, type Html5Node } from "@blazetrails/nokogiri";
import { rbInspect } from "@blazetrails/ruby-compat";

import { Scrubber, ScrubberNotFound } from "./scrubber.js";

export const ScrubBehavior = {
  Node: {
    scrubBang<T extends Html5Node | Html5DocumentFragment>(self: T, scrubber: unknown): T {
      const resolved = ScrubBehavior.resolveScrubber(scrubber);
      if (self instanceof HTML5.DocumentFragment) {
        for (const node of self.children) ScrubBehavior.Node.scrubBang(node, resolved);
      } else {
        resolved.traverse(self);
      }
      return self;
    },
  },

  resolveScrubber(scrubber: unknown): Scrubber {
    if (!(scrubber instanceof Scrubber)) {
      throw new ScrubberNotFound(`not a Scrubber or a scrubber name: ${rbInspect(scrubber)}`);
    }

    return scrubber;
  },
};
