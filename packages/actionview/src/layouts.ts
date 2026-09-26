import { ArgumentError, NameError, rbInspect } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/ruby-compat/include";
import type { LookupContext } from "./lookup-context.js";
import type { PathSet } from "./path-set.js";
import type { RenderableTemplate } from "./renderer/abstract-renderer.js";
import { _processRenderTemplateOptions as renderingProcessRenderTemplateOptions } from "./rendering.js";

type LayoutValue = string | RenderableTemplate | false | null | undefined;
type LayoutMethod = (
  this: Layouts,
  lookupContext: LookupContext,
  formats: readonly string[],
  keys: readonly string[],
) => LayoutValue;
type LayoutOption = string | ((...args: never[]) => unknown) | boolean | null | undefined;

type Layouts = {
  actionName: string;
  _actionHasLayout?: boolean;
  _layoutConditions: Record<string, string[]>;
  _prefixes(): string[];
  _isConditionalLayout(): boolean | undefined;
  _layout(
    lookupContext: LookupContext,
    formats: readonly string[],
    keys: readonly string[],
  ): unknown;
};

type LayoutsClass = {
  name: string;
  prototype: object;
  _layout?: LayoutOption;
  _layoutConditions?: Record<string, string[]>;
  controllerPath(): string;
  viewPaths(): PathSet;
  _writeLayoutMethod(): void;
  _impliedLayoutName(): string;
};

export const LayoutConditions = {
  /** @internal */
  _isConditionalLayout(this: Layouts): boolean | undefined {
    if (!_isConditionalLayout.call(this)) return undefined;

    const conditions = this._layoutConditions;

    let only: string[] | undefined;
    let except: string[] | undefined;
    if ((only = conditions["only"])) {
      return only.includes(this.actionName);
    } else if ((except = conditions["except"])) {
      return !except.includes(this.actionName);
    } else {
      return true;
    }
  },
};

export function layout(
  this: LayoutsClass,
  layout: LayoutOption,
  conditions: Record<string, string | string[]> = {},
): void {
  if (Object.keys(conditions).length > 0) include(this as never, LayoutConditions);

  const normalized: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(conditions)) normalized[k] = [v].flat().map(String);
  this._layoutConditions = normalized;

  this._layout = layout;
  this._writeLayoutMethod();
}

export function _writeLayoutMethod(this: LayoutsClass): void {
  const prototype = this.prototype;
  const _super: LayoutMethod = function (lookupContext, formats, keys) {
    const superclassLayout = (Object.getPrototypeOf(prototype) as { _layout?: LayoutMethod })
      ._layout;
    return (superclassLayout ?? _layout).call(this, lookupContext, formats, keys);
  };

  const impliedLayoutName = this._impliedLayoutName();
  const prefixes = /\blayouts/.test(impliedLayoutName) ? [] : ["layouts"];
  const defaultBehavior: LayoutMethod = function (lookupContext, formats, keys) {
    return (
      (lookupContext.findAll(impliedLayoutName, prefixes, false, keys, { formats })[0] as
        | RenderableTemplate
        | undefined) ?? _super.call(this, lookupContext, formats, keys)
    );
  };
  const nameClause = this.name ? defaultBehavior : _super;

  const layoutOption = this._layout;
  let layoutDefinition: LayoutMethod;
  if (typeof layoutOption === "string" && !layoutOption.startsWith(":")) {
    layoutDefinition = () => layoutOption;
  } else if (typeof layoutOption === "string") {
    layoutDefinition = function (lookupContext, formats, keys) {
      const layout = (this as unknown as Record<string, () => LayoutValue>)[
        layoutOption.slice(1)
      ]();
      if (layout == null) return defaultBehavior.call(this, lookupContext, formats, keys);
      if (!(typeof layout === "string" || !layout)) {
        throw new ArgumentError(
          `Your layout method ${layoutOption} returned ${String(layout)}. It ` +
            "should have returned a String, false, or nil",
        );
      }
      return layout;
    };
  } else if (typeof layoutOption === "function") {
    (this.prototype as { _layoutFromProc: unknown })._layoutFromProc = layoutOption;
    layoutDefinition = function (lookupContext, formats, keys) {
      const result = (
        this as unknown as { _layoutFromProc(self?: unknown): LayoutValue }
      )._layoutFromProc(...(layoutOption.length === 0 ? [] : [this]));
      if (result == null) return defaultBehavior.call(this, lookupContext, formats, keys);
      return result;
    };
  } else if (layoutOption === false) {
    layoutDefinition = () => null;
  } else if (layoutOption === true) {
    throw new ArgumentError("Layouts must be specified as a String, Symbol, Proc, false, or nil");
  } else {
    layoutDefinition = nameClause;
  }

  (this.prototype as { _layout: LayoutMethod })._layout = function (lookupContext, formats, keys) {
    if (this._isConditionalLayout()) {
      return layoutDefinition.call(this, lookupContext, formats, keys);
    } else {
      return nameClause.call(this, lookupContext, formats, keys);
    }
  };
}

/** @internal */
export function _impliedLayoutName(this: LayoutsClass): string {
  return this.controllerPath();
}

/** @internal */
export function _processRenderTemplateOptions(
  this: Layouts,
  options: Record<string, unknown>,
): void {
  renderingProcessRenderTemplateOptions.call(this, options);

  if (_isIncludeLayout(options)) {
    const layout = "layout" in options ? options["layout"] : ":default";
    delete options["layout"];
    options["layout"] = _layoutForOption.call(this, layout as LayoutOption);
  }
}

export function isActionHasLayout(this: Layouts): boolean {
  return this._actionHasLayout!;
}

/** @internal */
export function _isConditionalLayout(this: Layouts): boolean | undefined {
  return true;
}

/** @internal */
export function _layout(this: Layouts, ..._args: unknown[]): LayoutValue {
  return undefined;
}

/** @internal */
export function _layoutForOption(this: Layouts, name: LayoutOption) {
  if (typeof name === "string" && !name.startsWith(":")) {
    return _normalizeLayout(name);
  } else if (typeof name === "function") {
    return name;
  } else if (name === true) {
    return (lookupContext: LookupContext, formats: readonly string[], keys: readonly string[]) =>
      _defaultLayout.call(this, lookupContext, formats, keys, true);
  } else if (name === ":default") {
    return (lookupContext: LookupContext, formats: readonly string[], keys: readonly string[]) =>
      _defaultLayout.call(this, lookupContext, formats, keys, false);
  } else if (name === false || name == null) {
    return null;
  } else {
    throw new ArgumentError(
      `String, Proc, :default, true, or false, expected for \`layout'; you passed ${rbInspect(name)}`,
    );
  }
}

/** @internal */
export function _normalizeLayout<T>(value: T): T | string {
  return typeof value === "string" && !/\blayouts/.test(value) ? `layouts/${value}` : value;
}

/** @internal */
export function _defaultLayout(
  this: Layouts,
  lookupContext: LookupContext,
  formats: readonly string[],
  keys: readonly string[],
  requireLayout = false,
): LayoutValue {
  let value: LayoutValue;
  try {
    if (isActionHasLayout.call(this))
      value = this._layout(lookupContext, formats, keys) as LayoutValue;
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    e.message = `Could not render layout: ${e.message}`;
    throw e;
  }

  if (requireLayout && isActionHasLayout.call(this) && !value) {
    throw new ArgumentError(
      `There was no default layout for ${this.constructor.name} in ${rbInspect((this.constructor as unknown as LayoutsClass).viewPaths())}`,
    );
  }

  return _normalizeLayout(value);
}

/** @internal */
export function _isIncludeLayout(options: Record<string, unknown>): boolean {
  return (
    !["body", "plain", "html", "inline", "partial"].some((k) => k in options) || "layout" in options
  );
}
