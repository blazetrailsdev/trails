import type { PathSet } from "../path-set.js";
import type { Base } from "../render-parser.js";
import { PrismRenderParser } from "../render-parser/prism-render-parser.js";
import type { Template } from "../template.js";
import { WildcardResolver } from "./wildcard-resolver.js";

/** @internal */
export class RubyTracker {
  static EXPLICIT_DEPENDENCY = /# Template Dependency: (\S+)/g;

  static call(name: string, template: Template, viewPaths: PathSet | null = null): string[] {
    return new RubyTracker(name, template, viewPaths).dependencies();
  }

  dependencies(): string[] {
    return new WildcardResolver(this.viewPaths, [
      ...this.renderDependencies(),
      ...this.explicitDependencies(),
    ]).resolve();
  }

  static supportsViewPaths(): boolean {
    return true;
  }

  private _name: string;
  private _template: Template;
  private _viewPaths: PathSet | null;
  private _parserClass: new (name: string, code: string) => Base & { renderCalls(): string[] };

  constructor(
    name: string,
    template: Template,
    viewPaths: PathSet | null = null,
    {
      parserClass = PrismRenderParser,
    }: {
      parserClass?: new (name: string, code: string) => Base & { renderCalls(): string[] };
    } = {},
  ) {
    this._name = name;
    this._template = template;
    this._viewPaths = viewPaths;
    this._parserClass = parserClass;
  }

  private get template(): Template {
    return this._template;
  }

  private get name(): string {
    return this._name;
  }

  private get viewPaths(): PathSet | null {
    return this._viewPaths;
  }

  private renderDependencies(): string[] {
    if (!this.template.source.includes("render")) return [];

    const compiledSource = this.template.handler.call(this.template, this.template.source);

    return new this._parserClass(this._name, compiledSource)
      .renderCalls()
      .map((renderCall) => renderCall.replace(/\/_/g, "/"));
  }

  private explicitDependencies(): string[] {
    return [
      ...new Set(
        [...this.template.source.matchAll(RubyTracker.EXPLICIT_DEPENDENCY)]
          .map((m) => m.slice(1))
          .flat(),
      ),
    ];
  }
}
