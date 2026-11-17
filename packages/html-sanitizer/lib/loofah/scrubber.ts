import type { Html5Node } from "@blazetrails/nokogiri";
import { ArgumentError, RuntimeError } from "@blazetrails/ruby-compat";

export class ScrubberNotFound extends RuntimeError {}

type Direction = "top_down" | "bottom_up";

export class Scrubber {
  static readonly CONTINUE = Object.freeze({});

  static readonly STOP = Object.freeze({});

  direction: Direction;

  block: ((node: Html5Node) => unknown) | null;

  constructor(
    options: { direction?: Direction } = {},
    block: ((node: Html5Node) => unknown) | null = null,
  ) {
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
    throw new ScrubberNotFound(`No scrub method has been defined on ${this.constructor.name}`);
  }

  appendAttribute(node: Html5Node, attribute: string, value: string): void {
    const currentValue = node.get(attribute) ?? "";
    const currentValues = currentValue.split(/\s+/);
    const updatedValue = [...new Set([...currentValues, value])];
    node.set(attribute, updatedValue.join(" "));
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
