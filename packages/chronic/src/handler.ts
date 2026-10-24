import {
  STDOUT,
  rbEqual,
  rbFSend,
  rbModConstGet,
  rbObjClassname,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import type { Parser } from "./parser.js";
import type { Span } from "./span.js";
import type { Tag } from "./tag.js";
import type { Token } from "./token.js";

export type HandlerPattern = (string | string[])[];

export class Handler {
  pattern: HandlerPattern;
  handlerMethod: string | null;

  constructor(pattern: HandlerPattern, handlerMethod: string | null) {
    this.pattern = pattern;
    this.handlerMethod = handlerMethod;
  }

  match(tokens: Token[], definitions: Record<string, Handler[]>): boolean {
    let tokenIndex = 0;
    for (let elements of this.pattern) {
      let wasOptional = false;
      if (!Array.isArray(elements)) elements = [elements];

      for (let i = 0; i < elements.length; i++) {
        const element: unknown = elements[i];
        const isSymbol = typeof element === "string" && element.startsWith(":");
        let name = isSymbol ? element.slice(1) : String(element);
        const optional = name.slice(-1) === "?";
        if (optional) name = name.slice(0, -1);

        if (isSymbol) {
          if (this.isTagsMatch(name, tokens, tokenIndex)) {
            tokenIndex += 1;
            break;
          } else {
            if (optional) {
              wasOptional = true;
              continue;
            } else if (i + 1 < elements.length) {
              continue;
            } else {
              if (!wasOptional) return false;
            }
          }
        } else if (typeof element === "string") {
          if (optional && tokenIndex === tokens.length) return true;

          let subHandlers: Handler[];
          if (Object.hasOwn(definitions, name)) {
            subHandlers = definitions[name]!;
          } else {
            throw new RuntimeError(`Invalid subset ${name} specified`);
          }

          for (const subHandler of subHandlers) {
            if (subHandler.match(tokens.slice(tokenIndex), definitions)) return true;
          }
        } else {
          throw new RuntimeError(`Invalid match type: ${rbObjClassname(element)}`);
        }
      }
    }

    if (tokenIndex !== tokens.length) return false;
    return true;
  }

  invoke(type: string, tokens: Token[], parser: Parser, options: Record<string, unknown>): unknown {
    if (Chronic.debug) {
      STDOUT.puts(`-${type}`);
      STDOUT.puts(`Handler: ${String(this.handlerMethod)}`);
    }

    return rbFSend(parser, this.handlerMethod, tokens, options) as Span | null;
  }

  equals(other: Handler): boolean {
    return rbEqual(this.pattern, other.pattern);
  }

  /** @internal */
  private isTagsMatch(name: string, tokens: Token[], tokenIndex: number): boolean | undefined {
    const klass = rbModConstGet(
      Chronic,
      name.replace(/(?:^|_)(.)/gm, (_m, c: string) => c.toUpperCase()),
    ) as abstract new (...args: never[]) => Tag;

    if (tokens[tokenIndex]) {
      return !(tokens[tokenIndex].tags.filter((o) => o instanceof klass).length === 0);
    }
    return undefined;
  }
}

Chronic.Handler = Handler;
