import { pluralize, singularize } from "@blazetrails/activesupport";
import { StringScanner } from "@blazetrails/ruby-compat";

import type { PathSet } from "../path-set.js";
import type { Template } from "../template.js";
import { WildcardResolver } from "./wildcard-resolver.js";

/** @internal */
export class TSETracker {
  static EXPLICIT_DEPENDENCY = /# Template Dependency: (\S+)/g;

  static IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$]*/u;

  static VARIABLE_OR_METHOD_CHAIN = new RegExp(
    `(?:${this.IDENTIFIER.source}\\.)*(?<dynamic>${this.IDENTIFIER.source})`,
    "u",
  );

  static STRING = /(?<quote>['"`])(?<static>.*?)\k<quote>/su;

  static PARTIAL_HASH_KEY = /(?:\bpartial:|:partial\s*=>)\s*/;

  static LAYOUT_HASH_KEY = /(?:\blayout:|:layout\s*=>)\s*/;

  static RENDER_ARGUMENTS = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${this.PARTIAL_HASH_KEY.source}|${this.LAYOUT_HASH_KEY.source})?(?:${this.STRING.source}|${this.VARIABLE_OR_METHOD_CHAIN.source})`,
    "gsu",
  );

  static LAYOUT_DEPENDENCY = new RegExp(
    `^(?:\\s*\\(?\\s*)(?:.*?${this.LAYOUT_HASH_KEY.source})(?:${this.STRING.source}|${this.VARIABLE_OR_METHOD_CHAIN.source})`,
    "gsu",
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

    for (const arguments_ of renderCalls) {
      this.addDependencies(dependencies, arguments_, TSETracker.LAYOUT_DEPENDENCY);
      this.addDependencies(dependencies, arguments_, TSETracker.RENDER_ARGUMENTS);
    }

    return dependencies;
  }

  private addDependencies(renderDependencies: string[], arguments_: string, pattern: RegExp): void {
    for (const match of arguments_.matchAll(pattern)) {
      this.addDynamicDependency(renderDependencies, match.groups!.dynamic ?? null);
      this.addStaticDependency(
        renderDependencies,
        match.groups!.static ?? null,
        match.groups!.quote ?? null,
      );
    }
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
