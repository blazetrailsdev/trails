import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";

import { Parser } from "./css/parser.js";
import { SelectorCache } from "./css/selector-cache.js";
import { SyntaxError } from "./css/syntax-error.js";
import { XPathVisitor } from "./css/xpath-visitor.js";

export function xpathFor(
  selector: unknown,
  {
    prefix,
    visitor,
    ns,
    cache = true,
  }: { prefix?: string; visitor?: XPathVisitor; ns?: Record<string, string>; cache?: boolean } = {},
): string[] {
  if (typeof selector !== "string") {
    throw new TypeError(`no implicit conversion of ${rbInspect(selector)} to String`);
  }

  if (selector.length === 0) throw new SyntaxError("empty CSS selector");

  if (visitor != null) {
    if (prefix != null) throw new ArgumentError("cannot provide both :prefix and :visitor");
    if (ns != null) throw new ArgumentError("cannot provide both :ns and :visitor");
  }

  visitor ??= new XPathVisitor({
    ...(prefix != null ? { prefix } : {}),
    ...(ns != null ? { namespaces: ns } : {}),
  });

  if (cache) {
    const key = SelectorCache.key({ selector, visitor });
    return (
      SelectorCache.get(key) ?? SelectorCache.set(key, new Parser().xpathFor(selector, visitor))
    );
  } else {
    return new Parser().xpathFor(selector, visitor);
  }
}
