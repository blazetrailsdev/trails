import { type Html5Node } from "@blazetrails/nokogiri";

import { Scrubber } from "./scrubber.js";

export class Strip extends Scrubber {
  constructor() {
    super();
    this.direction = "bottom_up";
  }

  override scrub(node: Html5Node): unknown {
    if (this.html5libSanitize(node) === Scrubber.CONTINUE) return Scrubber.CONTINUE;

    node.before(node.children);
    node.remove();
    return Scrubber.STOP;
  }
}

export const Scrubbers = {
  Strip,

  MAP: {
    strip: Strip,
  } as Record<string, new () => Scrubber>,
};
