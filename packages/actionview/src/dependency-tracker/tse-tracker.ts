import { pluralize, singularize } from "@blazetrails/activesupport";
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

function argumentList(code: string): string[] {
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
    } else if (ch === "," && depth === 0) {
      args.push(code.slice(start, pos).trim());
      start = pos + 1;
    }
    pos += 1;
  }
  const last = code.slice(start, pos).trim();
  if (last.length > 0 || args.length > 0) args.push(last);
  return args;
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

  static PARTIAL_HASH_KEY = /(?:\bpartial:)\s*/u;

  static LAYOUT_HASH_KEY = /(?:\blayout:)\s*/u;

  static RENDER_ARGUMENTS = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${this.PARTIAL_HASH_KEY.source}|${this.LAYOUT_HASH_KEY.source})?(?:${this.STRING.source}|${this.VARIABLE_OR_METHOD_CHAIN.source})`,
    "su",
  );

  static LAYOUT_DEPENDENCY = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${this.LAYOUT_HASH_KEY.source})(?:${this.STRING.source}|${this.VARIABLE_OR_METHOD_CHAIN.source})`,
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

      for (const args of node.value.split(/\brender\b/).slice(1)) {
        const options = this.renderCallOptions(args);
        if (options == null) continue;

        if ("object" in options || "collection" in options) {
          if ("object" in options && "collection" in options) continue;
          if (!("partial" in options)) continue;
        }

        const spacer =
          options.spacerTemplate != null ? TSETracker.STRING.exec(options.spacerTemplate) : null;
        if (spacer?.index === 0 && spacer[0].length === options.spacerTemplate.length) {
          this.addStaticDependency(dependencies, spacer.groups?.static, spacer.groups?.quote);
        }
        this.addDependencies(dependencies, args, TSETracker.LAYOUT_DEPENDENCY);
        this.addDependencies(dependencies, args, TSETracker.RENDER_ARGUMENTS);
      }
    }

    return dependencies;
  }

  private renderCallOptions(code: string): Record<string, string> | null {
    let source = code.trimStart();
    if (source.startsWith("(")) source = source.slice(1);

    let arguments_ = argumentList(source).map((argument) => {
      let current = argument;
      while (current.startsWith("(") && argumentList(current.slice(1)).length === 1) {
        current = argumentList(current.slice(1))[0]!;
      }
      return current;
    });
    const isKeywordHash = (argument: string): boolean =>
      /^\{|^[\p{ID_Start}$_][\p{ID_Continue}$]*\s*:(?!:)/u.test(argument);
    if (arguments_.length > 0 && !arguments_[0].startsWith("{") && isKeywordHash(arguments_[0])) {
      arguments_ = [`{${arguments_.join(", ")}}`];
    }
    const length = arguments_.length;

    let options: Record<string, string> | null = null;
    if ((length === 1 || length === 2) && !isKeywordHash(arguments_[0])) {
      options = { partial: arguments_[0], locals: arguments_[1] ?? "" };
    } else if (length === 1 && arguments_[0].startsWith("{")) {
      const elements = argumentList(arguments_[0].slice(1)).filter((e) => e.length > 0);
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

  private addDependencies(renderDependencies: string[], args: string, pattern: RegExp): void {
    const match = pattern.exec(args);
    if (match) {
      this.addDynamicDependency(renderDependencies, match.groups?.dynamic);
      this.addStaticDependency(renderDependencies, match.groups?.static, match.groups?.quote);
    }
  }

  private addDynamicDependency(dependencies: string[], dependency: string | undefined): void {
    if (dependency != null) {
      dependencies.push(`${pluralize(dependency)}/${singularize(dependency)}`);
    }
  }

  private addStaticDependency(
    dependencies: string[],
    dependency: string | undefined,
    quoteType: string | undefined,
  ): void {
    if (quoteType === "`" && dependency != null && dependency.includes("${")) {
      let pos = 0;
      let wildcardDependency = "";

      while (pos < dependency.length) {
        const interpolation = dependency.indexOf("${", pos);
        if (interpolation >= 0) {
          let unmatchedBrackets = 1;
          wildcardDependency += dependency.slice(0, interpolation);
          pos = interpolation + 2;

          while (unmatchedBrackets > 0 && pos < dependency.length) {
            const found = dependency.slice(pos).search(/[{}]/);
            if (found < 0) return;

            const matched = dependency[pos + found];
            pos += found + 1;
            if (matched === "{") {
              unmatchedBrackets += 1;
            } else if (matched === "}") {
              unmatchedBrackets -= 1;
            }
          }

          wildcardDependency += "*";
        } else {
          wildcardDependency += dependency.slice(pos);
          pos = dependency.length;
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
