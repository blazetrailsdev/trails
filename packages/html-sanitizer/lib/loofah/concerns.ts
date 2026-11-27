import {
  HTML5,
  type Html5Document,
  type Html5DocumentFragment,
  type Html5Node,
  type NodeSet,
} from "@blazetrails/nokogiri";
import { rbInspect } from "@blazetrails/ruby-compat/object";

import { Scrubber, ScrubberNotFound } from "./scrubber.js";
import { Scrubbers } from "./scrubbers.js";

export const ScrubBehavior = {
  Node: {
    scrubBang<T extends Html5Node | Html5DocumentFragment | Html5Document>(
      self: T,
      scrubber: unknown,
    ): T {
      const resolved = ScrubBehavior.resolveScrubber(scrubber);
      if (self instanceof HTML5.Document) {
        const root = self.root;
        if (root) resolved.traverse(root);
      } else if (self instanceof HTML5.DocumentFragment) {
        ScrubBehavior.NodeSet.scrubBang(self.children, resolved);
      } else {
        resolved.traverse(self);
      }
      return self;
    },
  },

  NodeSet: {
    scrubBang(self: NodeSet, scrubber: unknown): NodeSet {
      for (const node of self) ScrubBehavior.Node.scrubBang(node, scrubber);
      return self;
    },
  },

  resolveScrubber(scrubber: unknown): Scrubber {
    if (typeof scrubber === "string" && Object.hasOwn(Scrubbers.MAP, scrubber)) {
      scrubber = new Scrubbers.MAP[scrubber]();
    }
    if (!(scrubber instanceof Scrubber)) {
      throw new ScrubberNotFound(`not a Scrubber or a scrubber name: ${rbInspect(scrubber)}`);
    }

    return scrubber;
  },
};
