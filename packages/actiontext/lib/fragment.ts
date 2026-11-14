import { delegate } from "@blazetrails/activesupport";
import { XML, type Html5DocumentFragment, type Html5Node } from "@blazetrails/nokogiri";
import { toS } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { HtmlConversion } from "./html-conversion.js";
import { PlainTextConversion } from "./plain-text-conversion.js";

export class Fragment {
  declare deconstruct: () => Html5Node[];

  static wrap(fragmentOrHtml: unknown): Fragment {
    if (fragmentOrHtml instanceof this) {
      return fragmentOrHtml;
    } else if (fragmentOrHtml instanceof XML.DocumentFragment) {
      return new this(fragmentOrHtml as unknown as Html5DocumentFragment);
    } else {
      return this.fromHtml(fragmentOrHtml);
    }
  }

  static fromHtml(html: unknown): Fragment {
    return new this(HtmlConversion.fragmentForHtml(toS(html).trim()));
  }

  readonly source: Html5DocumentFragment;
  /** @internal */
  protected plainText: string | null = null;
  /** @internal */
  protected html: string | null = null;

  constructor(source: Html5DocumentFragment) {
    this.source = source;
  }

  findAll(selector: string) {
    return this.source.css(selector);
  }

  update(block: (source: Html5DocumentFragment) => Promise<void>): Promise<Fragment>;
  update(block: (source: Html5DocumentFragment) => void): Fragment;
  /** @inventedArm then — PERMANENT */
  update(block: (source: Html5DocumentFragment) => unknown): Fragment | Promise<Fragment> {
    const source = this.source.dup();
    const yielded = block(source);
    if (yielded instanceof Promise) {
      return yielded.then(() => new (this.constructor as typeof Fragment)(source));
    }
    return new (this.constructor as typeof Fragment)(source);
  }

  replace(selector: string, block: (node: Html5Node) => Promise<unknown>): Promise<Fragment>;
  replace(selector: string, block: (node: Html5Node) => unknown): Fragment;
  /** @inventedArm then — PERMANENT */
  replace(selector: string, block: (node: Html5Node) => unknown): Fragment | Promise<Fragment> {
    return this.update((source): Promise<void> | void => {
      let pending: Promise<void> | null = null;
      source.css(selector).each((node) => {
        const swap = (replacementNode: unknown): void => {
          if (!node.equals(replacementNode)) node.replace(String(replacementNode));
        };
        if (pending) {
          pending = pending.then(async () => swap(await block(node)));
          return;
        }
        const replacementNode = block(node);
        if (replacementNode instanceof Promise) {
          pending = replacementNode.then(swap);
        } else {
          swap(replacementNode);
        }
      });
      return pending ?? undefined;
    }) as Fragment | Promise<Fragment>;
  }

  toPlainText(): string {
    return (this.plainText ??= PlainTextConversion.nodeToPlainText(this.source));
  }

  toHtml(): string {
    return (this.html ??= HtmlConversion.nodeToHtml(this.source));
  }

  toString(): string {
    return this.toHtml();
  }
}

delegate.call(Fragment.prototype, "deconstruct", { to: "source.elements" });

ActionText.Fragment = Fragment;
