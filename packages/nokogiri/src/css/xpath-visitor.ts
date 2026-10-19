import {
  ArgumentError,
  fixMod,
  rbFSend,
  rbInspect,
  rbObjRespondTo,
  toI,
} from "@blazetrails/ruby-compat";

import { libxml2Patches, usesLibxml } from "../version/info.js";
import { GLOBAL_SEARCH_PREFIX } from "../xml/xpath.js";
import { methodName, Node } from "./node.js";
import { SyntaxError } from "./syntax-error.js";

export const BuiltinsConfig = {
  NEVER: "never",
  ALWAYS: "always",
  OPTIMAL: "optimal",
  VALUES: ["never", "always", "optimal"],
} as const;

export const DoctypeConfig = {
  XML: "xml",
  HTML4: "html4",
  HTML5: "html5",
  VALUES: ["xml", "html4", "html5"],
} as const;

type Builtins = (typeof BuiltinsConfig.VALUES)[number];
type Doctype = (typeof DoctypeConfig.VALUES)[number];

export class XPathVisitor {
  static readonly WILDCARD_NAMESPACES = libxml2Patches().includes(
    "0009-allow-wildcard-namespaces.patch",
  );

  static readonly BuiltinsConfig = BuiltinsConfig;
  static readonly DoctypeConfig = DoctypeConfig;

  readonly builtins: Builtins;
  readonly doctype: Doctype;
  readonly prefix: string;
  readonly namespaces: Record<string, string> | null;

  constructor({
    builtins = BuiltinsConfig.NEVER,
    doctype = DoctypeConfig.XML,
    prefix = GLOBAL_SEARCH_PREFIX,
    namespaces = null,
  }: {
    builtins?: Builtins;
    doctype?: Doctype;
    prefix?: string;
    namespaces?: Record<string, string> | null;
  } = {}) {
    if (!BuiltinsConfig.VALUES.includes(builtins)) {
      throw new ArgumentError(
        `Invalid values ${rbInspect(builtins)} for builtins: keyword parameter`,
      );
    }
    if (!DoctypeConfig.VALUES.includes(doctype)) {
      throw new ArgumentError(
        `Invalid values ${rbInspect(doctype)} for doctype: keyword parameter`,
      );
    }

    this.builtins = builtins;
    this.doctype = doctype;
    this.prefix = prefix;
    this.namespaces = namespaces;
  }

  config() {
    return {
      builtins: this.builtins,
      doctype: this.doctype,
      prefix: this.prefix,
      namespaces: this.namespaces,
    };
  }

  visitFunction(node: Node): string {
    const msg = methodName(`visit_function_${node.value[0].replace(/[(]/g, "")}`);
    if (rbObjRespondTo(this, msg)) return rbFSend(this, msg, node) as string;

    const fn: string = node.value[0];
    if (/^text\(/m.test(fn)) {
      return "child::text()";
    } else if (/^self\(/m.test(fn)) {
      return `self::${node.value[1]}`;
    } else if (/^eq\(/m.test(fn)) {
      return `position()=${node.value[1]}`;
    } else if (/^(nth|nth-of-type)\(/m.test(fn)) {
      if (node.value[1] instanceof Node && node.value[1].type === "NTH") {
        return this.nth(node.value[1]);
      } else {
        return `position()=${node.value[1]}`;
      }
    } else if (/^nth-child\(/m.test(fn)) {
      if (node.value[1] instanceof Node && node.value[1].type === "NTH") {
        return this.nth(node.value[1], { child: true });
      } else {
        return `count(preceding-sibling::*)=${Number(toI(node.value[1])) - 1}`;
      }
    } else if (/^nth-last-of-type\(/m.test(fn)) {
      if (node.value[1] instanceof Node && node.value[1].type === "NTH") {
        return this.nth(node.value[1], { last: true });
      } else {
        const index = Number(toI(node.value[1])) - 1;
        return index === 0 ? "position()=last()" : `position()=last()-${index}`;
      }
    } else if (/^nth-last-child\(/m.test(fn)) {
      if (node.value[1] instanceof Node && node.value[1].type === "NTH") {
        return this.nth(node.value[1], { last: true, child: true });
      } else {
        return `count(following-sibling::*)=${Number(toI(node.value[1])) - 1}`;
      }
    } else if (/^(first|first-of-type)\(/m.test(fn)) {
      return "position()=1";
    } else if (/^(last|last-of-type)\(/m.test(fn)) {
      return "position()=last()";
    } else if (/^contains\(/m.test(fn)) {
      return `contains(.,${node.value[1]})`;
    } else if (/^gt\(/m.test(fn)) {
      return `position()>${node.value[1]}`;
    } else if (/^only-child\(/m.test(fn)) {
      return "last()=1";
    } else if (/^comment\(/m.test(fn)) {
      return "comment()";
    } else if (/^has\(/m.test(fn)) {
      const isDirect = node.value[1].value[0] == null;
      return `.${isDirect ? "" : "//"}${node.value[1].accept(this)}`;
    } else {
      this.validateXpathFunctionName(fn);

      const args = [
        ".",
        ...node.value.slice(1).map((n) => (n instanceof Node ? n.accept(this) : n)),
      ];
      return `nokogiri:${fn}${args.join(",")})`;
    }
  }

  visitNot(node: Node): string {
    const child: Node = node.value[0];
    if ("ELEMENT_NAME" === child.type) {
      return `not(self::${child.accept(this)})`;
    } else {
      return `not(${child.accept(this)})`;
    }
  }

  visitId(node: Node): string {
    const m = /^#(.*)$/m.exec(node.value[0]);
    return `@id='${m?.[1] ?? ""}'`;
  }

  visitAttributeCondition(node: Node): string {
    const attribute = node.value[0].accept(this);
    if (node.value.length === 1) return attribute;

    let value: string = String(node.value.at(-1));
    if (!/^['"]/m.test(value)) value = `'${value}'`;

    if (value[0] === value.at(-1) && `"'`.includes(value[0])) {
      const strValue = value.slice(1, -1);
      if (strValue.includes(value[0])) {
        value = 'concat("' + strValue.split('"').join(`",'"',"`) + '","")';
      }
    }

    switch (node.value[1]) {
      case "equal":
        return attribute + "=" + value;
      case "not_equal":
        return attribute + "!=" + value;
      case "substring_match":
        return `contains(${attribute},${value})`;
      case "prefix_match":
        return `starts-with(${attribute},${value})`;
      case "dash_match":
        return `${attribute}=${value} or starts-with(${attribute},concat(${value},'-'))`;
      case "includes":
        value = value.slice(1, -1);
        return this.cssClass(attribute, value);
      case "suffix_match":
        return `substring(${attribute},string-length(${attribute})-string-length(${value})+1,string-length(${value}))=${value}`;
      default:
        return attribute + ` ${node.value[1]} ` + value;
    }
  }

  visitPseudoClass(node: Node): string {
    if (node.value[0] instanceof Node && node.value[0].type === "FUNCTION") {
      return node.value[0].accept(this);
    } else {
      const msg = methodName(`visit_pseudo_class_${node.value[0].replace(/[(]/g, "")}`);
      if (rbObjRespondTo(this, msg)) return rbFSend(this, msg, node) as string;

      switch (node.value[0]) {
        case "first":
          return "position()=1";
        case "first-child":
          return "count(preceding-sibling::*)=0";
        case "last":
          return "position()=last()";
        case "last-child":
          return "count(following-sibling::*)=0";
        case "first-of-type":
          return "position()=1";
        case "last-of-type":
          return "position()=last()";
        case "only-child":
          return "count(preceding-sibling::*)=0 and count(following-sibling::*)=0";
        case "only-of-type":
          return "last()=1";
        case "empty":
          return "not(node())";
        case "parent":
          return "node()";
        case "root":
          return "not(parent::*)";
        default:
          this.validateXpathFunctionName(node.value[0]);
          return `nokogiri:${node.value[0]}(.)`;
      }
    }
  }

  visitClassCondition(node: Node): string {
    return this.cssClass("@class", node.value[0]);
  }

  visitCombinator(node: Node): string {
    if (this.isOfTypePseudoClass(node.value.at(-1))) {
      return `${node.value[0]?.accept(this) ?? ""}][${node.value.at(-1).accept(this)}`;
    } else {
      return `${node.value[0]?.accept(this) ?? ""} and ${node.value.at(-1).accept(this)}`;
    }
  }

  visitDirectAdjacentSelector(node: Node): string {
    return `${node.value[0] ? node.value[0].accept(this) : ""}/following-sibling::*[1]/self::${node.value.at(-1).accept(this)}`;
  }

  visitFollowingSelector(node: Node): string {
    return `${node.value[0] ? node.value[0].accept(this) : ""}/following-sibling::${node.value.at(-1).accept(this)}`;
  }

  visitDescendantSelector(node: Node): string {
    return `${node.value[0] ? node.value[0].accept(this) : ""}//${node.value.at(-1).accept(this)}`;
  }

  visitChildSelector(node: Node): string {
    return `${node.value[0] ? node.value[0].accept(this) : ""}/${node.value.at(-1).accept(this)}`;
  }

  visitConditionalSelector(node: Node): string {
    return node.value[0].accept(this) + "[" + node.value.at(-1).accept(this) + "]";
  }

  visitElementName(node: Node): string {
    if (this.doctype === DoctypeConfig.HTML5 && this.html5ElementNameNeedsNamespaceHandling(node)) {
      if (
        this.builtins === BuiltinsConfig.ALWAYS ||
        (this.builtins === BuiltinsConfig.OPTIMAL && usesLibxml())
      ) {
        if (XPathVisitor.WILDCARD_NAMESPACES) {
          return `*:${node.value[0]}`;
        } else {
          return `*[nokogiri-builtin:local-name-is('${node.value[0]}')]`;
        }
      } else {
        return `*[local-name()='${node.value[0]}']`;
      }
    } else if (node.value.length === 2) {
      if (node.value[0] == null) {
        return node.value.at(-1);
      } else {
        return node.value.join(":");
      }
    } else if (
      node.value[0] !== "*" &&
      this.namespaces != null &&
      Object.hasOwn(this.namespaces, "xmlns")
    ) {
      return `xmlns:${node.value[0]}`;
    } else {
      return node.value[0];
    }
  }

  visitAttribName(node: Node): string {
    return `@${node.value[0]}`;
  }

  accept(node: Node): string {
    return node.accept(this);
  }

  /** @internal */
  protected validateXpathFunctionName(name: string): void {
    if (name.startsWith("-")) {
      throw new SyntaxError(`Invalid XPath function name '${name}'`);
    }
  }

  /** @internal */
  protected html5ElementNameNeedsNamespaceHandling(node: Node): boolean {
    return node.value.length === 1 && node.value[0] !== "*";
  }

  /** @internal */
  protected nth(node: Node, options: { child?: boolean; last?: boolean } = {}): string {
    if (node.value.length !== 4) {
      throw new ArgumentError(
        `expected an+b node to contain 4 tokens, but is ${rbInspect(node.value)}`,
      );
    }

    const [a, b] = this.readAAndPositiveB(node.value);
    let position: string;
    if (options.child) {
      position = options.last
        ? "(count(following-sibling::*)+1)"
        : "(count(preceding-sibling::*)+1)";
    } else {
      position = options.last ? "(last()-position()+1)" : "position()";
    }

    if (b === 0) {
      return `(${position} mod ${a})=0`;
    } else {
      const compare = a < 0 ? "<=" : ">=";
      if (Math.abs(a) === 1) {
        return `${position}${compare}${b}`;
      } else {
        return `(${position}${compare}${b}) and (((${position}-${b}) mod ${Math.abs(a)})=0)`;
      }
    }
  }

  /** @internal */
  protected readAAndPositiveB(values: string[]): [number, number] {
    const op = values[2].trim();
    let a: number;
    let b: number;
    if (op === "+") {
      a = Number(toI(values[0]));
      b = Number(toI(values[3]));
    } else if (op === "-") {
      a = Number(toI(values[0]));
      b = a - fixMod(Number(toI(values[3])), a);
    } else {
      throw new ArgumentError(
        `expected an+b node to have either + or - as the operator, but is ${rbInspect(op)}`,
      );
    }
    return [a, b];
  }

  /** @internal */
  protected isOfTypePseudoClass(node: Node): boolean {
    if (node.type === "PSEUDO_CLASS") {
      const name =
        node.value[0] instanceof Node && node.value[0].type === "FUNCTION"
          ? node.value[0].value[0]
          : node.value[0];
      return /(nth|first|last|only)-of-type(\()?/.test(name);
    }
    return false;
  }

  /** @internal */
  protected cssClass(hay: string, needle: string): string {
    if (
      this.builtins === BuiltinsConfig.ALWAYS ||
      (this.builtins === BuiltinsConfig.OPTIMAL && usesLibxml())
    ) {
      return `nokogiri-builtin:css-class(${hay},'${needle}')`;
    } else {
      return `contains(concat(' ',normalize-space(${hay}),' '),' ${needle} ')`;
    }
  }
}
