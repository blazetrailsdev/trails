import { type Html5Node } from "@blazetrails/nokogiri";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { aryDelete } from "@blazetrails/ruby-compat/array";
import { rbObjDup } from "@blazetrails/ruby-compat/include";
import { rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { warn } from "@blazetrails/ruby-compat/kernel-warn";

import { Scrub } from "./loofah/html5/scrub.js";
import { SafeList } from "./loofah/html5/safelist.js";
import { Scrubber } from "./loofah/scrubber.js";
import { HTML } from "./namespaces.js";

type Attr = Html5Node["attributeNodes"][number];
type Enumerable = Set<string> | string[];

export class PermitScrubber extends Scrubber {
  /** @internal */
  private _tags: Enumerable | null;
  /** @internal */
  private _attributes: Enumerable | null;
  readonly prune: boolean;

  constructor({ prune = false }: { prune?: boolean } = {}) {
    super();
    this.prune = prune;
    this.direction = this.prune ? "top_down" : "bottom_up";
    this._tags = null;
    this._attributes = null;
  }

  get tags(): Enumerable | null {
    return this._tags;
  }

  set tags(tags: Iterable<string> | null) {
    this._tags = this.validateBang(rbObjDup(tags) as Enumerable | null, "tags");
  }

  get attributes(): Enumerable | null {
    return this._attributes;
  }

  set attributes(attributes: Iterable<string> | null) {
    this._attributes = this.validateBang(rbObjDup(attributes) as Enumerable | null, "attributes");
  }

  override scrub(node: Html5Node): unknown {
    if (Scrub.isCdataNeedsEscaping(node)) {
      const replacement = Scrub.cdataEscape(node);
      node.replace(replacement);
      return Scrubber.CONTINUE;
    }
    if (this.isSkipNode(node)) return Scrubber.CONTINUE;

    if (!((node.isElement() || node.isComment()) && this.isKeepNode(node))) {
      if (this.scrubNode(node) !== Scrubber.CONTINUE) return Scrubber.STOP;
    }

    this.scrubAttributes(node);
    return Scrubber.CONTINUE;
  }

  /** @internal */
  protected isAllowedNode(node: Html5Node): boolean {
    return this._tags instanceof Set ? this._tags.has(node.name) : this._tags!.includes(node.name);
  }

  /** @internal */
  protected isSkipNode(node: Html5Node): boolean {
    return node.isText();
  }

  /** @internal */
  protected isScrubAttribute(name: string): boolean {
    return !(this._attributes instanceof Set
      ? this._attributes.has(name)
      : this._attributes!.includes(name));
  }

  /** @internal */
  protected isKeepNode(node: Html5Node): boolean {
    if (this._tags) {
      return this.isAllowedNode(node);
    } else {
      return Scrub.isAllowedElement(node.name);
    }
  }

  /** @internal */
  protected scrubNode(node: Html5Node): unknown {
    if (!(this.prune || node.namespace)) {
      node.before(node.children);
    }
    return node.remove();
  }

  /** @internal */
  protected scrubAttributes(node: Html5Node): void {
    if (this._attributes) {
      for (const attr of node.attributeNodes) {
        if (this.isScrubAttribute(attr.name)) {
          attr.remove();
        } else {
          this.scrubAttribute(node, attr);
        }
      }

      this.scrubCssAttribute(node);
    } else {
      Scrub.scrubAttributes(node);
    }
  }

  /** @internal */
  protected scrubCssAttribute(node: Html5Node): void {
    if (rbObjRespondTo(Scrub, "scrubCssAttribute")) {
      Scrub.scrubCssAttribute(node);
    } else {
      const style = node.attributes["style"];
      if (style) style.value = Scrub.scrubCss(style.value);
    }
  }

  /** @internal */
  protected validateBang(var_: Enumerable | null, name: string): Enumerable | null {
    if (var_ != null && (typeof var_ === "string" || typeof var_[Symbol.iterator] !== "function")) {
      throw new ArgumentError(`You should pass :${name} as an Enumerable`);
    }

    if (var_ != null && name === "tags") {
      if (var_ instanceof Set ? var_.has("mglyph") : var_.includes("mglyph")) {
        warn("WARNING: 'mglyph' tags cannot be allowed by the PermitScrubber and will be scrubbed");
        if (var_ instanceof Set) var_.delete("mglyph");
        else aryDelete(var_, "mglyph");
      }

      if (var_ instanceof Set ? var_.has("malignmark") : var_.includes("malignmark")) {
        warn(
          "WARNING: 'malignmark' tags cannot be allowed by the PermitScrubber and will be scrubbed",
        );
        if (var_ instanceof Set) var_.delete("malignmark");
        else aryDelete(var_, "malignmark");
      }

      if (var_ instanceof Set ? var_.has("noscript") : var_.includes("noscript")) {
        warn(
          "WARNING: 'noscript' tags cannot be allowed by the PermitScrubber and will be scrubbed",
        );
        if (var_ instanceof Set) var_.delete("noscript");
        else aryDelete(var_, "noscript");
      }
    }

    return var_;
  }

  /** @internal */
  protected scrubAttribute(node: Html5Node, attrNode: Attr): void {
    const attrName = attrNode.namespace
      ? `${attrNode.namespace.prefix}:${attrNode.nodeName}`
      : attrNode.nodeName;

    if (SafeList.ATTR_VAL_IS_URI.has(attrName) && Scrub.scrubUriAttribute(attrNode)) return;

    if (SafeList.SVG_ATTR_VAL_ALLOWS_REF.has(attrName)) {
      Scrub.scrubAttributeThatAllowsLocalRef(attrNode);
    }

    if (
      SafeList.SVG_ALLOW_LOCAL_HREF.has(node.name) &&
      attrName === "xlink:href" &&
      /^\s*[^#\s].*/ms.test(attrNode.value)
    ) {
      attrNode.remove();
    }

    if (attrName === "src" && !/[^\s]/.test(attrNode.value)) node.removeAttribute(attrNode.name);

    Scrub.forceCorrectAttributeEscapingBang(node);
  }
}

export class TargetScrubber extends PermitScrubber {
  protected override isAllowedNode(node: Html5Node): boolean {
    return !super.isAllowedNode(node);
  }

  protected override isScrubAttribute(name: string): boolean {
    return !super.isScrubAttribute(name);
  }
}

export class TextOnlyScrubber extends Scrubber {
  constructor() {
    super();
    this.direction = "bottom_up";
  }

  override scrub(node: Html5Node): unknown {
    if (node.isText()) {
      return Scrubber.CONTINUE;
    } else {
      node.before(node.children);
      return node.remove();
    }
  }
}

HTML.PermitScrubber = PermitScrubber;
HTML.TargetScrubber = TargetScrubber;
HTML.TextOnlyScrubber = TextOnlyScrubber;
