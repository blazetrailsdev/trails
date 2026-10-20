import {
  camelize,
  classAttribute,
  Concern,
  ConstantLookup,
  extend,
  HashWithIndifferentAccess,
  isBlank,
  isPlainObject,
  runLoadHooks,
  safeConstantize,
  underscore,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import {
  AbstractController,
  ActionController,
  ActionDispatch,
  type RouteSet,
} from "@blazetrails/actionpack";
import {
  include,
  Module,
  rbClassSuperclass,
  rbDeclareIvar,
  rbFSend,
  rbModConstSet,
  rbModDefineMethod,
  rbObjInstanceVariables,
  rbObjIsKindOf,
  rbObjIvarGet,
  rbObjIvarSet,
  rbObjRespondTo,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { OutputBuffer } from "./buffers.js";
import { Context } from "./context.js";
import { OutputFlow } from "./flows.js";
import { Helpers } from "./helpers.js";
import { RecordIdentifier } from "./record-identifier.js";
import { RoutingUrlFor } from "./routing-url-for.js";
import { ActionView } from "./namespaces.js";
import { Testing } from "./testing.js";
import { Assertions as DomTestingAssertions } from "./testing/assertions.js";

type HelperModule = object;
type Parser = ((rendered: string) => unknown) | null | undefined;

export class TestController extends ActionController.Base {
  declare _testCase: () => TestCase;

  declare static _controllerPath: string;

  static override controllerPath(): string {
    return this._controllerPath;
  }

  static setControllerPath(path: string): void {
    this._controllerPath = path;
  }

  setControllerPath(path: string): void {
    (this.constructor as typeof TestController).setControllerPath(path);
  }

  static override controllerName(): string {
    return "test";
  }

  constructor() {
    super();
    (this.constructor as typeof TestController).setControllerPath("");
    this.request = ActionController.TestRequest.create(this.constructor);
    this.response = new ActionDispatch.TestResponse();

    delete this.request.env["PATH_INFO"];
    this.params = new ActionController.Parameters();
  }
}

include(TestController, ActionDispatch.TestProcess);

export class RenderedViewContent extends String {}

export class RenderedViewsCollection {
  /** @internal */
  private _renderedViews: Map<unknown, Array<Record<string, unknown> | undefined>>;

  constructor() {
    this._renderedViews ??= new Map();
  }

  add(view: unknown, locals: Record<string, unknown> | undefined): void {
    if (!this._renderedViews.has(view)) this._renderedViews.set(view, []);
    this._renderedViews.get(view)!.push(locals);
  }

  localsFor(view: unknown): Array<Record<string, unknown> | undefined> {
    if (!this._renderedViews.has(view)) this._renderedViews.set(view, []);
    return this._renderedViews.get(view)!;
  }

  renderedViews(): unknown[] {
    return [...this._renderedViews.keys()];
  }

  isViewRendered(view: unknown, expectedLocals: Record<string, unknown>): boolean {
    return this.localsFor(view).some((actualLocals) =>
      Object.entries(expectedLocals).every(([key, value]) => value === actualLocals?.[key]),
    );
  }
}

interface LocalsView extends Base {
  renderedViews: RenderedViewsCollection;
}

export const Locals = {
  renderedViews: undefined as RenderedViewsCollection | undefined,

  render(
    this: LocalsView,
    options: Record<string, unknown> | string | object = {},
    localAssigns: Record<string, unknown> = {},
    block?: () => unknown,
  ): ReturnType<Base["render"]> {
    if (isPlainObject(options)) {
      const opts = options as Record<string, unknown>;
      if (block) {
        this.renderedViews.add(opts["layout"], opts["locals"] as Record<string, unknown>);
      } else if ("partial" in opts) {
        this.renderedViews.add(opts["partial"], opts["locals"] as Record<string, unknown>);
      }
    } else {
      this.renderedViews.add(options, localAssigns);
    }

    const superclass = rbClassSuperclass(rbObjSingletonClass(this)) as typeof Base;
    return superclass.prototype.render.call(this, options, localAssigns, block);
  },
};

export const INTERNAL_IVARS = [
  "@NAME",
  "@failures",
  "@assertions",
  "@__io__",
  "@_assertion_wrapped",
  "@_assertions",
  "@_result",
  "@_routes",
  "@controller",
  "@_controller",
  "@_request",
  "@_config",
  "@_default_form_builder",
  "@_layouts",
  "@_files",
  "@_rendered_views",
  "@method_name",
  "@output_buffer",
  "@_partials",
  "@passed",
  "@rendered",
  "@request",
  "@routes",
  "@tagged_logger",
  "@_templates",
  "@options",
  "@test_passed",
  "@view",
  "@view_context_class",
  "@view_flow",
  "@_subscribers",
  "@html_document",
];

export interface Behavior {
  controller: TestController;
  request: TestController["request"];
  outputBuffer: OutputBuffer;
  rendered: RenderedViewContent;
  viewFlow: OutputFlow;
  routes?: RouteSet;
  /** @internal */
  _renderedViews?: RenderedViewsCollection;
  /** @internal */
  __view?: LocalsView;
  _helpers: HelperModule;
  /** @internal */
  view(): LocalsView;
  /** @internal */
  viewAssigns(): Record<string, unknown>;
  renderedViews(): RenderedViewsCollection;
}

interface BehaviorClass {
  name: string;
  contentClass: typeof RenderedViewContent;
  _helperClass?: HelperModule | null;
  _helpers: HelperModule;
  helper(...args: unknown[]): void;
  _helpersForModification(): Record<string, unknown>;
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown;
  determineDefaultHelperClass(name: string): HelperModule | null;
  helperClass: HelperModule | null;
  registerParser(format: string, callable?: Parser, block?: Parser): void;
  setup(...args: unknown[]): void;
}

export const ClassMethods = {
  registerParser(
    this: BehaviorClass,
    format: string,
    callable: Parser = null,
    block: Parser = null,
  ): void {
    if (!Object.hasOwn(this, "__class_attr_contentClass")) {
      this.contentClass = class extends this.contentClass {};
    }
    const parser = callable || block || ((itself: string) => itself);
    rbModDefineMethod(this.contentClass, format, function (this: RenderedViewContent) {
      return parser(this.toString());
    });
  },

  tests(this: BehaviorClass, helperClass: string | HelperModule): void {
    if (typeof helperClass === "string") {
      this.helperClass = safeConstantize(
        camelize(`${underscore(helperClass)}_helper`),
      ) as HelperModule | null;
    } else if (rbObjIsKindOf(helperClass, Module) || isPlainObject(helperClass)) {
      this.helperClass = helperClass;
    }
  },

  determineDefaultHelperClass(this: BehaviorClass, name: string): HelperModule | null {
    return this.determineConstantFromTestName(
      name,
      (constant) =>
        (rbObjIsKindOf(constant, Module) || isPlainObject(constant)) &&
        !(typeof constant === "function"),
    ) as HelperModule | null;
  },

  helperMethod(this: BehaviorClass, ...methods: Array<string | string[]>): void {
    for (const method of methods.flat()) {
      Object.defineProperty(this._helpersForModification(), method, {
        value(this: { _testCase(): object }, ...args: unknown[]): unknown {
          return rbFSend(this._testCase(), method, ...args);
        },
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  },

  set helperClass(helperClass: HelperModule | null) {
    (this as unknown as BehaviorClass)._helperClass = helperClass;
  },

  get helperClass(): HelperModule | null {
    const klass = this as unknown as BehaviorClass;
    return (
      (Object.hasOwn(klass, "_helperClass") ? klass._helperClass : null) ||
      (klass._helperClass = klass.determineDefaultHelperClass(klass.name))
    );
  },

  /** @internal */
  includeHelperModulesBang(this: BehaviorClass): void {
    if (this.helperClass) this.helper(this.helperClass);
    include(this as never, this._helpers);
  },
};

/** @missingRailsArgs new — PERMANENT */
function setupWithController(this: Behavior): void {
  const controllerClass = (() => class extends TestController {})();
  this.controller = new controllerClass();
  this.request = this.controller.request;
  this.viewFlow = new OutputFlow();
  this.outputBuffer = new OutputBuffer();
  this.rendered = new (this.constructor as unknown as BehaviorClass).contentClass("");

  rbModDefineMethod(controllerClass, "_testCase", () => this);
}

function config(this: Behavior): unknown {
  if (rbObjRespondTo(this.controller, "config")) {
    return (this.controller as unknown as { config: unknown }).config;
  }
  return null;
}

function render(
  this: Behavior,
  options: Record<string, unknown> | string | object = {},
  localAssigns: Record<string, unknown> = {},
  block?: () => unknown,
): ReturnType<Base["render"]> {
  const view = this.view();
  view.assign(this.viewAssigns());
  const output = view.render(options, localAssigns, block);
  const append = (value: unknown) => {
    const contentClass = (this.constructor as unknown as BehaviorClass).contentClass;
    this.rendered = new contentClass(`${this.rendered}${value ?? ""}`);
    return value;
  };
  return (output instanceof Promise ? output.then(append) : append(output)) as typeof output;
}

function renderedViews(this: Behavior): RenderedViewsCollection {
  return (this._renderedViews ??= new RenderedViewsCollection());
}

/** @internal */
function documentRootElement(this: Behavior) {
  return Testing.htmlDocument().parse(
    isBlank(this.rendered.toString()) ? this.outputBuffer.toStr() : this.rendered.toString(),
  ).root;
}

/** @internal */
function view(this: Behavior): LocalsView {
  return (this.__view ??= (() => {
    const view = this.controller.viewContext() as unknown as LocalsView;
    include(rbObjSingletonClass(view), this._helpers);
    extend(view, Locals);
    view.renderedViews = this.renderedViews();
    view.outputBuffer = this.outputBuffer;
    return view;
  })());
}

/** @internal */
function _userDefinedIvars(this: Behavior): string[] {
  return rbObjInstanceVariables(this).filter((ivar) => !INTERNAL_IVARS.includes(ivar));
}

/** @internal */
function viewAssigns(this: Behavior): Record<string, unknown> {
  return Object.fromEntries(
    _userDefinedIvars.call(this).map((ivar) => [ivar.slice(1), rbObjIvarGet(this, ivar)]),
  );
}

interface RoutesHost {
  namedRoutes: { isRouteDefined(name: string): boolean };
  mountedHelpers: () => object;
}

/** @internal */
function methodMissing(this: Behavior, selector: string, ...args: unknown[]): unknown {
  let routes: RoutesHost | false | undefined;
  try {
    routes =
      rbObjRespondTo(this.controller, "_routes") &&
      (this.controller as unknown as { _routes: RoutesHost })._routes;
  } catch {
    /** @empty */
  }

  if (
    routes &&
    (routes.namedRoutes.isRouteDefined(selector) ||
      selector in routes.mountedHelpers().constructor.prototype)
  ) {
    return rbFSend(this.controller, selector, ...args);
  } else {
    return rbFSend(ActiveSupportTestCase.prototype, "methodMissing", selector, ...args);
  }
}

/** @internal */
function respondToMissing(this: Behavior, name: string, _includePrivate = false): boolean {
  let routes: RoutesHost | false | undefined;
  try {
    routes =
      rbObjRespondTo(this.controller, "_routes") &&
      (this.controller as unknown as { _routes: RoutesHost })._routes;
  } catch {
    /** @empty */
  }

  return Boolean(
    routes &&
    (routes.namedRoutes.isRouteDefined(name) ||
      name in routes.mountedHelpers().constructor.prototype),
  );
}

export const Behavior = {
  controller: undefined as TestController | undefined,
  request: undefined as TestController["request"] | undefined,
  outputBuffer: undefined as OutputBuffer | undefined,
  rendered: undefined as RenderedViewContent | undefined,
  get lookupContext(): unknown {
    return (this as unknown as Behavior).controller.lookupContext;
  },
  get _routes(): unknown {
    const controller = (this as unknown as Behavior).controller;
    if (rbObjRespondTo(controller, "_routes")) {
      return (controller as unknown as { _routes: unknown })._routes;
    }
    return null;
  },
  setupWithController,
  config,
  render,
  renderedViews,
  documentRootElement,
  view,
  _view: view,
  _userDefinedIvars,
  viewAssigns,
  methodMissing,
  respondToMissing,
};
extend(Behavior, Concern);

include(Behavior, ActionDispatch.TestProcess);
include(Behavior, ActionDispatch.Assertions);
include(Behavior, DomTestingAssertions);
include(Behavior, ActionController.TemplateAssertions);
include(Behavior, Context);

include(Behavior, ActionDispatch.Routing.PolymorphicRoutes);

include(Behavior, AbstractController.Helpers);
include(Behavior, Helpers);
include(Behavior, RecordIdentifier);
include(Behavior, RoutingUrlFor);

include(Behavior, ConstantLookup);

rbModConstSet(Behavior, "ClassMethods", ClassMethods);

(
  Behavior as unknown as { included(base: null, block: (this: BehaviorClass) => void): void }
).included(null, function (this: BehaviorClass) {
  classAttribute.call(this, "contentClass", {
    instanceAccessor: false,
    default: RenderedViewContent,
  });

  rbDeclareIvar(this as never, "@view", "__view");
  rbDeclareIvar(this as never, "@_routes", "__routes");
  this.setup(":setupWithController");

  this.registerParser("html", (rendered) => Testing.htmlDocumentFragment().parse(rendered));
  this.registerParser("json", (rendered) => new HashWithIndifferentAccess(JSON.parse(rendered)));

  runLoadHooks("action_view_test_case", this);

  this.helper((helper: Record<string, unknown>) => {
    Object.assign(helper, {
      isProtectAgainstForgery(): boolean {
        return false;
      },

      _testCase(this: { controller: TestController }): TestCase {
        return this.controller._testCase();
      },
    });
  });
});

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Behavior` (`actionview/lib/action_view/test_case.rb:446`); the class/interface merge is how a mixin surfaces on the type side. */
export interface TestCase extends Behavior {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TestCase extends ActiveSupportTestCase {
  /** @inlinedFrom ActionDispatch::Routing::UrlFor#initialize rails/v8.0.2/actionpack/lib/action_dispatch/routing/url_for.rb:111-114 */
  constructor(name: string) {
    (new.target as unknown as typeof ClassMethods).includeHelperModulesBang.call(
      new.target as unknown as BehaviorClass,
    );
    super(name);
    rbObjIvarSet(this, "@_routes", null);
  }
}

include(TestCase, Behavior);

rbModConstSet(ActionView, "TestCase", TestCase);
