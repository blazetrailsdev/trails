import { pluralize, singularize } from "@blazetrails/activesupport";

import { RenderParser } from "../namespaces.js";
import { ALL_KNOWN_KEYS, Base, RENDER_TYPE_KEYS } from "../render-parser.js";

const IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$]*/u;
const KEYWORD_PAIR = new RegExp(`^(${IDENTIFIER.source})\\s*:(?!:)([\\s\\S]*)$`, "u");
const READ_CHAIN = new RegExp(
  `^(?:${IDENTIFIER.source}\\s*\\.\\s*)*(${IDENTIFIER.source})\\s*(\\([\\s\\S]*\\))?$`,
  "u",
);

function argumentList(code: string): [string[], number] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let pos = 0;
  while (pos < code.length) {
    const ch = code[pos];
    if (ch === "'" || ch === '"' || ch === "`") {
      pos += 1;
      while (pos < code.length && code[pos] !== ch) pos += code[pos] === "\\" ? 2 : 1;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (
      depth === 0 &&
      (ch === ";" || (/\s/.test(code[pos - 1] ?? "") && /^do\b/.test(code.slice(pos))))
    ) {
      break;
    } else if (ch === "," && depth === 0) {
      args.push(code.slice(start, pos).trim());
      start = pos + 1;
    }
    pos += 1;
  }
  const last = code.slice(start, pos).trim();
  if (last.length > 0 || args.length > 0) args.push(last);
  return [args, pos];
}

function isStringNode(node: string | null | undefined): boolean {
  return node != null && /^(['"])[\s\S]*\1$|^`[^`]*`$/.test(node) && !/^`[\s\S]*\$\{/.test(node);
}

function unescaped(node: string): string {
  return node.slice(1, -1);
}

/** @internal */
export class PrismRenderParser extends Base {
  /** @missingRailsCall parse — CONVERGEABLE prism-render-parser-walks-a-js-ast */
  renderCalls(): string[] {
    const code = this._code;
    let masked = "";
    const quotes: string[] = [];
    for (let pos = 0; pos < code.length; pos += 1) {
      const ch = code[pos];
      const quote = quotes.at(-1);
      if (quote === undefined || quote === "{") {
        if (ch === "'" || ch === '"' || ch === "`") quotes.push(ch);
        else if (quote === "{" && ch === "{") quotes.push("{");
        else if (quote === "{" && ch === "}") quotes.pop();
        masked += ch;
      } else if (ch === "\\") {
        masked += " ".repeat(Math.min(2, code.length - pos));
        pos += 1;
      } else if (ch === quote) {
        quotes.pop();
        masked += ch;
      } else if (quote === "`" && code.startsWith("${", pos)) {
        quotes.push("{");
        masked += "${";
        pos += 1;
      } else {
        masked += " ";
      }
    }
    const queue = [...masked.matchAll(/\brender(?:ToString)?\b/g)];
    const templates: string[] = [];

    for (const [index, node] of queue.entries()) {
      const options = this.renderCallOptions(
        code.slice(node.index + node[0].length, queue[index + 1]?.index),
      );
      if (options == null) continue;

      const renderType = Object.keys(options).find((key) => RENDER_TYPE_KEYS.includes(key))!;
      const [template, objectTemplate] = this.renderCallTemplate(options[renderType] ?? "") ?? [];
      if (template == null) continue;

      if ("object" in options || "collection" in options || objectTemplate) {
        if ("object" in options && "collection" in options) continue;
        if (!("partial" in options)) continue;
      }

      if (isStringNode(options.spacerTemplate)) {
        templates.push(this.partialToVirtualPath("partial", unescaped(options.spacerTemplate!)));
      }

      templates.push(this.partialToVirtualPath(renderType, template));

      if (renderType !== "layout" && isStringNode(options.layout)) {
        templates.push(this.partialToVirtualPath("layout", unescaped(options.layout!)));
      }
    }

    return templates;
  }

  /** @internal */
  private renderCallOptions(code: string): Record<string, string | null> | null {
    const source = code.startsWith("(") ? code.slice(1) : code.trimStart();

    let arguments_ = argumentList(source)[0];
    const isKeywordHash = (argument: string): boolean =>
      argument.startsWith("{") || KEYWORD_PAIR.test(argument);
    if (arguments_.length > 0 && !arguments_[0].startsWith("{") && isKeywordHash(arguments_[0])) {
      arguments_ = [`{${arguments_.join(", ")}}`];
    }
    const length = arguments_.length;

    arguments_ = arguments_.map((argument) => {
      let current = argument;
      while (current.startsWith("(")) {
        const [body, end] = argumentList(current.slice(1));
        if (body.length !== 1 || end !== current.length - 2) break;
        current = body[0];
      }
      return current;
    });

    let options: Record<string, string | null> | null = null;
    if ((length === 1 || length === 2) && !isKeywordHash(arguments_[0])) {
      options = { partial: arguments_[0], locals: arguments_[1] ?? null };
    } else if (length === 1 && arguments_[0].startsWith("{")) {
      const elements = argumentList(arguments_[0].slice(1))[0].filter((e) => e.length > 0);
      const pairs = elements.map((element) => KEYWORD_PAIR.exec(element));
      if (pairs.every((pair) => pair != null)) {
        options = Object.fromEntries(pairs.map((pair) => [pair[1], pair[2].trim()]));
      }
    }

    if (options == null) return null;

    const keys = Object.keys(options);
    if (!keys.some((key) => RENDER_TYPE_KEYS.includes(key))) return null;
    if (keys.some((key) => !ALL_KNOWN_KEYS.includes(key))) return null;

    return options;
  }

  /** @internal */
  private renderCallTemplate(node: string): [string, boolean] | null {
    const objectTemplate = false;
    let template: string;
    if (isStringNode(node)) {
      const path = unescaped(node);
      template = path.includes("/") ? path : `${this.directory()}/${path}`;
    } else if (node.startsWith("`") && node.endsWith("`")) {
      template = "";
      let rest = node.slice(1, -1);
      while (rest.length > 0) {
        const open = rest.indexOf("${");
        if (open === -1) {
          template += rest;
          break;
        }
        template += rest.slice(0, open);
        const [, end] = argumentList(rest.slice(open + 2));
        if (rest[open + 2 + end] !== "}") return null;
        template += "*";
        rest = rest.slice(open + 3 + end);
      }
    } else {
      const call = READ_CHAIN.exec(node);
      if (call == null) return null;
      if (call[2] != null && argumentList(call[2].slice(1))[1] !== call[2].length - 2) return null;
      const dependency = call[1];

      template = `${pluralize(dependency)}/${singularize(dependency)}`;
    }

    return [template, objectTemplate];
  }
}

RenderParser.Default = PrismRenderParser;
