import { pluralize, singularize } from "@blazetrails/activesupport";
import { StringScanner } from "@blazetrails/ruby-compat";
import { parse } from "@blazetrails/tse-compiler";

import type { PathSet } from "../path-set.js";
import type { Template } from "../template.js";
import { WildcardResolver } from "./wildcard-resolver.js";

const ALL_KNOWN_KEYS = [
  "partial",
  "template",
  "layout",
  "formats",
  "locals",
  "object",
  "collection",
  "as",
  "status",
  "contentType",
  "location",
  "spacerTemplate",
];

const RENDER_TYPE_KEYS = ["partial", "template", "layout"];

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

/** @internal */
export class TSETracker {
  static EXPLICIT_DEPENDENCY = /# Template Dependency: (\S+)/g;

  static IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$]*/u;

  static VARIABLE_OR_METHOD_CHAIN = new RegExp(
    `(?:${this.IDENTIFIER.source}\\.)*(?<dynamic>${this.IDENTIFIER.source})`,
    "u",
  );

  static STRING = /(?<quote>['"`])(?<static>.*?)\k<quote>/su;

  static RENDER_ARGUMENTS = new RegExp(
    `(?:${this.STRING.source}|${this.VARIABLE_OR_METHOD_CHAIN.source})`,
    "su",
  );

  static supportsViewPaths(): boolean {
    return true;
  }

  static call(name: string, template: Template, viewPaths: PathSet | null = null): string[] {
    return new TSETracker(name, template, viewPaths).dependencies();
  }

  private _name: string;
  private _template: Template;
  private _viewPaths: PathSet | null;

  constructor(name: string, template: Template, viewPaths: PathSet | null = null) {
    this._name = name;
    this._template = template;
    this._viewPaths = viewPaths;
  }

  dependencies(): string[] {
    return new WildcardResolver(this._viewPaths, [
      ...this.renderDependencies(),
      ...this.explicitDependencies(),
    ]).resolve();
  }

  private get name(): string {
    return this._name;
  }

  private get template(): Template {
    return this._template;
  }

  private get source(): string {
    return this.template.source;
  }

  private get directory(): string {
    return this.name.split("/").slice(0, -1).join("/");
  }

  private renderDependencies(): string[] {
    const dependencies: string[] = [];

    for (const node of parse(this.source).nodes) {
      if (node.kind === "text") continue;

      const code = node.value;
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
      const calls = [...masked.matchAll(/\brender(?:ToString)?\b/g)];

      for (const [index, call] of calls.entries()) {
        const args = code.slice(call.index + call[0].length, calls[index + 1]?.index);
        const options = this.renderCallOptions(args);
        if (options == null) continue;

        const renderType = Object.keys(options).find((key) => RENDER_TYPE_KEYS.includes(key))!;
        const templates: string[] = [];
        this.addDependencies(templates, options[renderType] ?? "", TSETracker.RENDER_ARGUMENTS);
        if (templates.length === 0) continue;

        if ("object" in options || "collection" in options) {
          if ("object" in options && "collection" in options) continue;
          if (!("partial" in options)) continue;
        }

        const spacer = TSETracker.STRING.exec(options.spacerTemplate ?? "");
        if (
          spacer?.index === 0 &&
          spacer[0].length === options.spacerTemplate!.length &&
          !(spacer.groups!.quote === "`" && spacer.groups!.static.includes("${"))
        ) {
          dependencies.push(spacer.groups!.static);
        }

        dependencies.push(...templates);

        const layout = TSETracker.STRING.exec(options.layout ?? "");
        if (
          renderType !== "layout" &&
          layout?.index === 0 &&
          layout[0].length === options.layout!.length &&
          !(layout.groups!.quote === "`" && layout.groups!.static.includes("${"))
        ) {
          dependencies.push(layout.groups!.static);
        }
      }
    }

    return dependencies;
  }

  private renderCallOptions(code: string): Record<string, string | null> | null {
    const source = code.startsWith("(") ? code.slice(1) : code.trimStart();

    let arguments_ = argumentList(source)[0].map((argument) => {
      let current = argument;
      while (current.startsWith("(")) {
        const [body, end] = argumentList(current.slice(1));
        if (body.length !== 1 || end !== current.length - 2) break;
        current = body[0];
      }
      return current;
    });
    const isKeywordHash = (argument: string): boolean =>
      /^\{|^[\p{ID_Start}$_][\p{ID_Continue}$]*\s*:(?!:)/u.test(argument);
    if (arguments_.length > 0 && !arguments_[0].startsWith("{") && isKeywordHash(arguments_[0])) {
      arguments_ = [`{${arguments_.join(", ")}}`];
    }
    const length = arguments_.length;

    let options: Record<string, string | null> | null = null;
    if ((length === 1 || length === 2) && !isKeywordHash(arguments_[0])) {
      options = { partial: arguments_[0], locals: arguments_[1] ?? null };
    } else if (length === 1 && arguments_[0].startsWith("{")) {
      const elements = argumentList(arguments_[0].slice(1))[0].filter((e) => e.length > 0);
      const pairs = elements.map((element) =>
        /^([\p{ID_Start}$_][\p{ID_Continue}$]*)\s*:([\s\S]*)$/u.exec(element),
      );
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

  private addDependencies(renderDependencies: string[], arguments_: string, pattern: RegExp): void {
    const match = pattern.exec(arguments_);
    if (match?.index !== 0) return;
    const rest = arguments_.slice(match[0].length).trimStart();
    if (
      rest.length > 0 &&
      (match.groups!.static != null ||
        !(rest.startsWith("(") && argumentList(rest.slice(1))[1] === rest.length - 2))
    ) {
      return;
    }
    this.addDynamicDependency(renderDependencies, match.groups!.dynamic ?? null);
    this.addStaticDependency(
      renderDependencies,
      match.groups!.static ?? null,
      match.groups!.quote ?? null,
    );
  }

  private addDynamicDependency(dependencies: string[], dependency: string | null): void {
    if (dependency != null) {
      dependencies.push(`${pluralize(dependency)}/${singularize(dependency)}`);
    }
  }

  private addStaticDependency(
    dependencies: string[],
    dependency: string | null,
    quoteType: string | null,
  ): void {
    if (quoteType === "`" && dependency!.includes("${")) {
      const scanner = new StringScanner(dependency!);

      let wildcardDependency = "";

      while (!scanner.isEos()) {
        if (scanner.scanUntil(/\$\{/) != null) {
          let unmatchedBrackets = 1;
          wildcardDependency += scanner.preMatch();

          while (unmatchedBrackets > 0 && !scanner.isEos()) {
            const found = scanner.scanUntil(/[{}]/);
            if (found == null) return;

            switch (scanner.matched()) {
              case "{":
                unmatchedBrackets += 1;
                break;
              case "}":
                unmatchedBrackets -= 1;
                break;
            }
          }

          wildcardDependency += "*";
        } else {
          wildcardDependency += scanner.rest();
          scanner.terminate();
        }
      }

      dependencies.push(wildcardDependency);
    } else if (dependency != null) {
      if (dependency.includes("/")) {
        dependencies.push(dependency);
      } else {
        dependencies.push(`${this.directory}/${dependency}`);
      }
    }
  }

  private explicitDependencies(): string[] {
    return [
      ...new Set(
        [...this.source.matchAll(TSETracker.EXPLICIT_DEPENDENCY)].map((m) => m.slice(1)).flat(),
      ),
    ];
  }
}
