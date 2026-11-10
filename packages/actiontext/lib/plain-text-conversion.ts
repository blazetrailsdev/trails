import { camelize, isBlank } from "@blazetrails/activesupport";
import { chomp } from "@blazetrails/ruby-compat";
import type { Html5DocumentFragment, Html5Node } from "@blazetrails/nokogiri";
import { ActionText } from "./action-text.js";

type PlainTextNode = Html5Node | Html5DocumentFragment;

export const PlainTextConversion = {
  nodeToPlainText(node: PlainTextNode): string {
    return this.removeTrailingNewlines(this.plainTextForNode(node));
  },

  /** @internal */
  plainTextForNode(node: PlainTextNode, index = 0): string {
    if (Object.hasOwn(plainTextMethods, this.plainTextMethodForNode(node))) {
      return plainTextMethods[this.plainTextMethodForNode(node)].call(this, node as never, index);
    } else {
      return this.plainTextForNodeChildren(node);
    }
  },

  /** @internal */
  plainTextForNodeChildren(node: PlainTextNode): string {
    const texts: string[] = [];
    node.children.forEach((child, index) => {
      texts.push(this.plainTextForNode(child, index));
    });
    return texts.join("");
  },

  /** @internal */
  plainTextMethodForNode(node: PlainTextNode): string {
    return `plainTextFor${camelize(String((node as { name?: string }).name))}Node`;
  },

  /** @internal */
  plainTextForBlock(node: PlainTextNode, _index = 0): string {
    return `${this.removeTrailingNewlines(this.plainTextForNodeChildren(node))}\n\n`;
  },

  /** @internal */
  plainTextForList(node: Html5Node, _index: number): string {
    return `${this.breakIfNestedList(node, this.plainTextForBlock(node))}`;
  },

  /** @internal */
  plainTextForBrNode(_node: Html5Node, _index: number): string {
    return "\n";
  },

  /** @internal */
  plainTextForTextNode(node: Html5Node, _index: number): string {
    return this.removeTrailingNewlines(node.text);
  },

  /** @internal */
  plainTextForDivNode(node: Html5Node, _index: number): string {
    return `${this.removeTrailingNewlines(this.plainTextForNodeChildren(node))}\n`;
  },

  /** @internal */
  plainTextForFigcaptionNode(node: Html5Node, _index: number): string {
    return `[${this.removeTrailingNewlines(this.plainTextForNodeChildren(node))}]`;
  },

  /** @internal */
  plainTextForBlockquoteNode(node: Html5Node, _index: number): string {
    let text = this.plainTextForBlock(node);
    if (isBlank(text)) return "“”";

    const rindex = [...text.matchAll(/\S/g)].at(-1)!.index + 1;
    text = `${text.slice(0, rindex)}”${text.slice(rindex)}`;
    const index = text.search(/\S/);
    text = `${text.slice(0, index)}“${text.slice(index)}`;
    return text;
  },

  /** @internal */
  plainTextForLiNode(node: Html5Node, index: number): string {
    const bullet = this.bulletForLiNode(node, index);
    const text = this.removeTrailingNewlines(this.plainTextForNodeChildren(node));
    const indentation = this.indentationForLiNode(node);

    return `${indentation ?? ""}${bullet} ${text}\n`;
  },

  /** @internal */
  removeTrailingNewlines(text: string): string {
    return chomp(text, "");
  },

  /** @internal */
  bulletForLiNode(node: Html5Node, index: number): string {
    if (this.listNodeNameForLiNode(node) === "ol") {
      return `${index + 1}.`;
    } else {
      return "•";
    }
  },

  /** @internal */
  listNodeNameForLiNode(node: Html5Node): string | null {
    for (const ancestor of node.ancestors()) {
      if (/^[uo]l$/.test(ancestor.name)) return ancestor.name;
    }
    return null;
  },

  /** @internal */
  indentationForLiNode(node: Html5Node): string | null {
    const depth = this.listNodeDepthForNode(node);
    if (depth > 1) {
      return "  ".repeat(depth - 1);
    }
    return null;
  },

  /** @internal */
  listNodeDepthForNode(node: Html5Node): number {
    return node
      .ancestors()
      .map((ancestor) => ancestor.name)
      .filter((name) => /^[uo]l$/.test(name)).length;
  },

  /** @internal */
  breakIfNestedList(node: Html5Node, text: string): string {
    if (this.listNodeDepthForNode(node) > 0) {
      return `\n${text}`;
    } else {
      return text;
    }
  },
};

type PlainTextMethod = (this: typeof PlainTextConversion, node: never, index: number) => string;

const plainTextMethods: Record<string, PlainTextMethod> = {
  plainTextForBrNode: PlainTextConversion.plainTextForBrNode,
  plainTextForTextNode: PlainTextConversion.plainTextForTextNode,
  plainTextForDivNode: PlainTextConversion.plainTextForDivNode,
  plainTextForFigcaptionNode: PlainTextConversion.plainTextForFigcaptionNode,
  plainTextForBlockquoteNode: PlainTextConversion.plainTextForBlockquoteNode,
  plainTextForLiNode: PlainTextConversion.plainTextForLiNode,
};

for (const element of ["h1", "p"]) {
  plainTextMethods[`plainTextFor${camelize(element)}Node`] = PlainTextConversion.plainTextForBlock;
}

for (const element of ["ul", "ol"]) {
  plainTextMethods[`plainTextFor${camelize(element)}Node`] = PlainTextConversion.plainTextForList;
}

ActionText.PlainTextConversion = PlainTextConversion;
