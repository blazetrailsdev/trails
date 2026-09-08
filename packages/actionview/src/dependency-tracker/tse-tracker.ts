import { pluralize, singularize } from "@blazetrails/activesupport";

import type { PathSet } from "../path-set.js";
import type { Template } from "../template.js";
import { WildcardResolver } from "./wildcard-resolver.js";

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

const VARIABLE_OR_METHOD_CHAIN = `(?:\\$|@{1,2})?(?:${IDENTIFIER}\\.)*(?<dynamic>${IDENTIFIER})`;

const STRING = `(?<quote>['"])(?<static>.*?)\\k<quote>`;

const PARTIAL_HASH_KEY = `(?:\\bpartial:|:partial\\s*=>)\\s*`;

const LAYOUT_HASH_KEY = `(?:\\blayout:|:layout\\s*=>)\\s*`;

/** @internal */
export class TSETracker {
  static EXPLICIT_DEPENDENCY = /# Template Dependency: (\S+)/g;

  static RENDER_ARGUMENTS = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${PARTIAL_HASH_KEY}|${LAYOUT_HASH_KEY})?(?:${STRING}|${VARIABLE_OR_METHOD_CHAIN})`,
    "s",
  );

  static LAYOUT_DEPENDENCY = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${LAYOUT_HASH_KEY})(?:${STRING}|${VARIABLE_OR_METHOD_CHAIN})`,
    "s",
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
    const renderCalls = this.source.split(/\brender\b/).slice(1);

    for (const args of renderCalls) {
      this.addDependencies(dependencies, args, TSETracker.LAYOUT_DEPENDENCY);
      this.addDependencies(dependencies, args, TSETracker.RENDER_ARGUMENTS);
    }

    return dependencies;
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
    if (quoteType === '"' && dependency != null && dependency.includes("#{")) {
      let pos = 0;
      let wildcardDependency = "";

      while (pos < dependency.length) {
        const interpolation = dependency.indexOf("#{", pos);
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
    return [...new Set([...this.source.matchAll(TSETracker.EXPLICIT_DEPENDENCY)].map((m) => m[1]))];
  }
}
