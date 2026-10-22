/** @internal */

import {
  Concern,
  extend,
  I18n,
  isPlainObject,
  type SafeBuffer,
  dasherize,
  underscore,
} from "@blazetrails/activesupport";
import { Hash, rbModConstSet, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { include, Module, rbCallSuper } from "@blazetrails/ruby-compat/include";
import { Base } from "./base.js";
import { DetailsKey, type LookupContext } from "./lookup-context.js";
import { Renderer } from "./renderer.js";
import { Template } from "./template.js";
import { ActionView } from "./namespaces.js";
import { ViewPaths } from "./view-paths.js";

type I18nConfig = InstanceType<typeof I18n.Config>;

/** @internal */
export class I18nProxy extends I18n.Config {
  readonly originalConfig: I18nConfig;
  readonly lookupContext: LookupContext;

  constructor(originalConfig: I18nConfig, lookupContext: LookupContext) {
    super();
    if (rbObjRespondTo(originalConfig, "originalConfig")) {
      originalConfig = (originalConfig as I18nProxy).originalConfig;
    }
    this.originalConfig = originalConfig;
    this.lookupContext = lookupContext;
  }

  override get locale(): I18nConfig["locale"] {
    return this.originalConfig.locale;
  }

  override set locale(value: I18nConfig["locale"]) {
    this.lookupContext.locale = value as string | null;
  }
}
rbModConstSet(ActionView, "I18nProxy", I18nProxy);

export interface RenderOptions {
  template?: string;
  partial?: string | true | object;
  action?: string;
  layout?: string | false;
  formats?: string[];
  locals?: Record<string, unknown>;
  status?: number;
  body?: string;
  plain?: string;
  html?: string;
  json?: unknown;
  inline?: string;
  [k: string]: unknown;
}

/** @internal */
export interface ViewContextClassMethods {
  _routes?: ViewContextRoutes | null;
  _helpers?: object | null;
  supportsPath(): boolean;
  viewContextClass(): typeof Base;
  buildViewContextClass(
    klass: typeof Base,
    supportsPath: boolean,
    routes: ViewContextRoutes | null | undefined,
    helpers: object | null | undefined,
  ): typeof Base;
  isInheritViewContextClass(): boolean;
  /** @internal */
  _viewContextClass?: typeof Base;
}

export interface ViewContextRoutes {
  urlHelpers(supportsPath?: boolean): object;
  mountedHelpers(): object;
}

async function process(
  this: { lookupContext: LookupContext },
  ...args: unknown[]
): Promise<unknown> {
  const oldConfig = I18n.config();
  I18n.setConfig(new I18nProxy(I18n.config(), this.lookupContext));
  try {
    return await Rendering.superMethod(this, "process")!(...args);
  } finally {
    I18n.setConfig(oldConfig);
  }
}

/** @internal */
function superclassOf(klass: ViewContextClassMethods): ViewContextClassMethods | null {
  const parent = Object.getPrototypeOf(klass) as ViewContextClassMethods | null;
  return typeof parent === "function" ? parent : null;
}

export function isInheritViewContextClass(this: ViewContextClassMethods): boolean {
  const superclass = superclassOf(this);
  return (
    typeof superclass?.viewContextClass === "function" &&
    this.supportsPath() === superclass.supportsPath() &&
    this._routes === superclass._routes &&
    this._helpers === superclass._helpers
  );
}

export function buildViewContextClass(
  this: ViewContextClassMethods,
  klass: typeof Base,
  supportsPath: boolean,
  routes: ViewContextRoutes | null | undefined,
  helpers: object | null | undefined,
): typeof Base {
  if (this.isInheritViewContextClass()) {
    return superclassOf(this)!.viewContextClass();
  }

  const subclass = class extends klass {};
  if (routes) {
    include(subclass, routes.urlHelpers(supportsPath));
    include(subclass, routes.mountedHelpers());
  }

  if (helpers) {
    include(subclass, helpers);
  }
  return subclass;
}

export function eagerLoadBang(this: ViewContextClassMethods): null {
  rbCallSuper(this, eagerLoadBang);
  this.viewContextClass();
  return null;
}

export function viewContextClass(this: ViewContextClassMethods): typeof Base {
  const klass = DetailsKey.viewContextClass();

  if (this._viewContextClass === undefined || !Object.hasOwn(this, "_viewContextClass")) {
    this._viewContextClass = this.buildViewContextClass(
      klass,
      this.supportsPath(),
      this._routes,
      this._helpers,
    );
  }

  if (klass.isChanged(this._viewContextClass)) {
    this._viewContextClass = this.buildViewContextClass(
      klass,
      this.supportsPath(),
      this._routes,
      this._helpers,
    );
  }

  return this._viewContextClass;
}

/** @internal */
export interface ViewContextHost {
  viewContextClass(): typeof Base;
  lookupContext: LookupContext;
  viewAssigns(): Record<string, unknown>;
}

export function viewContext(this: ViewContextHost): Base {
  return new (this.viewContextClass())(
    this.lookupContext,
    this.viewAssigns(),
    this as unknown as null,
  );
}

/** @internal */
export interface ViewRendererHost {
  lookupContext: LookupContext;
  /** @internal */
  _viewRenderer?: Renderer;
}

export function renderedFormat(this: { _renderedFormat?: unknown }): unknown {
  return this._renderedFormat;
}

export function viewRenderer(this: ViewRendererHost): Renderer {
  return (this._viewRenderer ??= new Renderer(this.lookupContext));
}

/** @internal */
export interface RenderToBodyHost {
  lookupContext: LookupContext;
  viewContext(): Base;
  /** @internal */
  _renderedFormat?: unknown;
  /** @internal */
  _processOptions(options: Record<string, unknown>): void;
  /** @internal */
  _processRenderTemplateOptions(options: Record<string, unknown>): void;
  /** @internal */
  _renderTemplate(options: Record<string, unknown>): Promise<string | SafeBuffer | null>;
}

export async function renderToBody(
  this: RenderToBodyHost,
  options: Record<string, unknown> = {},
): Promise<string | SafeBuffer | null> {
  this._processOptions(options);
  this._processRenderTemplateOptions(options);
  return this._renderTemplate(options);
}

/** @internal */
export async function _renderTemplate(
  this: RenderToBodyHost,
  options: Record<string, unknown>,
): Promise<string | SafeBuffer | null> {
  const variant = options["variant"];
  delete options["variant"];
  const assigns = options["assigns"];
  delete options["assigns"];
  const context = this.viewContext();

  if (assigns != null && assigns !== false) context.assign(assigns as Record<string, unknown>);
  if (variant != null && variant !== false) this.lookupContext.variants = variant as string[];

  const renderedTemplate = await context.inRenderingContext(options, (renderer) =>
    renderer.renderToObject(context, options),
  );

  const renderedFormat = renderedTemplate.format ?? this.lookupContext.formats[0];
  this._renderedFormat = Template.Types.get(renderedFormat as string);

  return renderedTemplate.body;
}

/** @internal */
export function _processFormat(
  this: { lookupContext: LookupContext },
  format: { toSym?(): string | null; toString(): string },
): void {
  Rendering.superMethod(this, "_processFormat")!(format);
  if (format.toSym?.() != null) this.lookupContext.formats = [format.toSym() as string];
}

/** @internal */
export function _normalizeArgs(
  this: object,
  action: unknown = null,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  options = Rendering.superMethod(this, "_normalizeArgs")!(action, options) as Record<
    string,
    unknown
  >;
  if (action == null) {
    return options;
  } else if (isPlainObject(action) || action instanceof Hash) {
    options = action as Record<string, unknown>;
  } else if (typeof action === "string") {
    const key = action.includes("/") ? "template" : "action";
    options[key] = action;
  } else {
    if (
      rbObjRespondTo(action, "isPermitted") &&
      (action as { isPermitted(): boolean }).isPermitted()
    ) {
      options = action as Record<string, unknown>;
    } else if (rbObjRespondTo(action, "renderIn")) {
      options["renderable"] = action;
    } else {
      options["partial"] = action;
    }
  }

  return options;
}

/**
 * @inventedArm underscore — PERMANENT
 * @inventedArm dasherize — PERMANENT
 * @internal
 */
export function _processRenderTemplateOptions(
  this: { actionName: string; _prefixes(): string[] },
  options: Record<string, unknown>,
): void {
  if (options["partial"] === true) {
    options["partial"] = dasherize(underscore(this.actionName));
  }

  if (!["partial", "file", "template"].some((k) => k in options)) {
    options["prefixes"] ??= this._prefixes();
  }

  options["template"] ??= dasherize(underscore(String(options["action"] ?? this.actionName)));
}

export const ClassMethods = {
  get _routes(): ViewContextRoutes | null {
    return null;
  },
  set _routes(value: ViewContextRoutes | null) {
    Object.defineProperty(this, "_routes", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  },
  get _helpers(): object | null {
    return null;
  },
  set _helpers(value: object | null) {
    Object.defineProperty(this, "_helpers", {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  },
  isInheritViewContextClass,
  buildViewContextClass,
  eagerLoadBang,
  viewContextClass,
};

export const Rendering = new Module((mod) => {
  extend(mod, Concern);
  mod.include(ViewPaths);

  mod.defineMethod("process", process);
  mod.defineMethod("viewContextClass", function (this: { constructor: ViewContextClassMethods }) {
    return this.constructor.viewContextClass();
  });
  mod.defineMethod("renderedFormat", renderedFormat);
  mod.defineMethod("viewContext", viewContext);
  mod.defineMethod("viewRenderer", viewRenderer);
  mod.defineMethod("renderToBody", renderToBody);
  mod.defineMethod("_renderTemplate", _renderTemplate);
  mod.defineMethod("_processFormat", _processFormat);
  mod.defineMethod("_normalizeArgs", _normalizeArgs);
  mod.defineMethod("_processRenderTemplateOptions", _processRenderTemplateOptions);
}) as Module & { ClassMethods: typeof ClassMethods };
Rendering.ClassMethods = ClassMethods;
