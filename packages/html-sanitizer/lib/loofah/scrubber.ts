import { HTML5, type Html5Node } from "@blazetrails/nokogiri";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { rbModName } from "@blazetrails/ruby-compat/object";
import { stringSplit } from "@blazetrails/ruby-compat/string/split";

import { Scrub } from "./html5/scrub.js";

export class ScrubberNotFound extends RuntimeError {}

type Direction = "top_down" | "bottom_up";

export class Scrubber {
  static readonly CONTINUE = Object.freeze({});

  static readonly STOP = Object.freeze({});

  direction: Direction;

  block: ((node: Html5Node) => unknown) | null;

  constructor(
    options: { direction?: Direction } | ((node: Html5Node) => unknown) = {},
    block: ((node: Html5Node) => unknown) | null = null,
  ) {
    if (typeof options === "function") {
      block = options;
      options = {};
    }
    const direction = options.direction ?? "top_down";
    if (!["top_down", "bottom_up"].includes(direction)) {
      throw new ArgumentError(`direction ${direction} must be one of :top_down or :bottom_up`);
    }

    this.direction = direction;
    this.block = block;
  }

  traverse(node: Html5Node): void {
    if (this.direction === "bottom_up") {
      this.traverseConditionallyBottomUp(node);
    } else {
      this.traverseConditionallyTopDown(node);
    }
  }

  scrub(_node: Html5Node): unknown {
    throw new ScrubberNotFound(
      `No scrub method has been defined on ${rbModName(this.constructor)}`,
    );
  }

  appendAttribute(node: Html5Node, attribute: string, value: string): void {
    const currentValue = node.get(attribute) ?? "";
    const currentValues = stringSplit(currentValue, /\s+/);
    const updatedValue = [...new Set([...currentValues, value])];
    node.set(attribute, updatedValue.join(" "));
  }

  /** @internal */
  protected html5libSanitize(node: Html5Node): unknown {
    switch (node.type) {
      case HTML5.Node.ELEMENT_NODE:
        if (Scrub.isAllowedElement(node.name)) {
          Scrub.scrubAttributes(node);
          return Scrubber.CONTINUE;
        }
        break;
      case HTML5.Node.TEXT_NODE:
      case HTML5.Node.CDATA_SECTION_NODE:
        if (Scrub.isCdataNeedsEscaping(node)) {
          node.before(Scrub.cdataEscape(node));
          return Scrubber.STOP;
        }
        return Scrubber.CONTINUE;
    }
    return Scrubber.STOP;
  }

  /** @internal */
  private traverseConditionallyTopDown(node: Html5Node): void {
    if (this.block) {
      if (this.block(node) === Scrubber.STOP) return;
    } else if (this.scrub(node) === Scrubber.STOP) {
      return;
    }
    for (const j of node.children) this.traverseConditionallyTopDown(j);
  }

  /** @internal */
  private traverseConditionallyBottomUp(node: Html5Node): void {
    for (const j of node.children) this.traverseConditionallyBottomUp(j);
    if (this.block) {
      this.block(node);
    } else {
      this.scrub(node);
    }
  }
}
