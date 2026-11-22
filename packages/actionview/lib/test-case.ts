import "./constants.test-case.generated.js";
import {
  camelize,
  classAttribute,
  Concern,
  extend,
  HashWithIndifferentAccess,
  isBlank,
  runLoadHooks,
  safeConstantize,
  underscore,
} from "@blazetrails/activesupport";
import { ConstantLookup } from "@blazetrails/activesupport/testing/constant-lookup";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { AbstractController, ActionController, ActionDispatch } from "@blazetrails/actionpack";
import { ControllerTestRequest } from "@blazetrails/actionpack/testing";
import {
  include,
  isPlainHash,
  Module,
  NoMethodError,
  rbClassSuperclass,
  rbDeclareIvar,
  rbEqual,
  rbFSend,
  rbModDefineMethod,
  rbModMethodDefined,
  rbObjClassname,
  rbObjInstanceVariables,
  rbClassNewInstance,
  rbObjIsKindOf,
  rbObjIvarGet,
  rbObjIvarSet,
  rbObjRespondTo,
  rbObjSingletonClass,
  rbStrSend,
  StandardError,
  isSymbol,
  stringSuperclass,
  symbolToS,
} from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { OutputBuffer } from "./buffers.js";
import { Context } from "./context.js";
import { OutputFlow } from "./flows.js";
import { Helpers } from "./helpers.js";
import { RecordIdentifier } from "./record-identifier.js";
import { RoutingUrlFor } from "./routing-url-for.js";
import { Testing } from "./rails-dom-testing/testing.js";
import { Assertions as DomTestingAssertions } from "./rails-dom-testing/assertions.js";

type HelperModule = object;
type Parser = ((rendered: string) => unknown) | null | undefined;

export class TestController extends ActionController.Base {
  declare _testCase: () => TestCase;

  override get request(): ActionController.Base["request"] {
    return this._request;
  }
  override set request(value: ActionController.Base["request"]) {
    this._request = value;
  }

  override get response(): ActionController.Base["response"] {
    return this._response;
  }
  override set response(value: ActionController.Base["response"]) {
    this._response = value;
  }

  override get params(): ActionController.Base["params"] {
    return this._params as ActionController.Base["params"];
  }
  override set params(value: ActionController.Base["params"]) {
    this._params = value;
  }

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

  protected constructor() {
    super();
    (this.constructor as typeof TestController).setControllerPath("");
    this.request = ControllerTestRequest.create(this.constructor);
  }

  static async new<T extends TestController>(this: { prototype: T }): Promise<T> {
    const controller = rbClassNewInstance(this);
    controller.response = await ActionDispatch.TestResponse.new();

    delete controller.request.env["PATH_INFO"];
    controller.params = new ActionController.Parameters();
    return controller;
  }
}

include(TestController, ActionDispatch.TestProcess);

export interface Behavior {
  constructor: BehaviorClass;
  controller: TestController;
  request: TestController["request"];
  outputBuffer: OutputBuffer;
  rendered: RenderedViewContent;
  viewFlow: OutputFlow;
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

/** @internal */
export interface BehaviorClass {
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

export const Behavior = {
  get lookupContext(): unknown {
    return this.controller.lookupContext;
  },
  controller: undefined as TestController | undefined,
  request: undefined as TestController["request"] | undefined,
  outputBuffer: undefined as OutputBuffer | undefined,
  rendered: undefined as RenderedViewContent | undefined,
  setupWithController,
  config,
  render,
  renderedViews,
  get _routes(): unknown {
    const controller = this.controller;
    if (rbObjRespondTo(controller, "_routes")) {
      return controller._routes;
    }
    return null;
  },
  documentRootElement,
  view,
  _view: view,
  _userDefinedIvars,
  viewAssigns,
  methodMissing,
  respondToMissing,
  ClassMethods: undefined as typeof ClassMethods | undefined,
  RenderedViewContent: undefined as typeof RenderedViewContent | undefined,
  RenderedViewsCollection: undefined as typeof RenderedViewsCollection | undefined,
  Locals: undefined as typeof Locals | undefined,
  INTERNAL_IVARS: undefined as typeof INTERNAL_IVARS | undefined,
} satisfies ThisType<Behavior>;
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

export const ClassMethods = {
  /** @internal */
  inherited(this: BehaviorClass, descendant: BehaviorClass): void {
    const descendantContentClass = class extends this.contentClass {};

    if (rbObjRespondTo(descendantContentClass, "setTemporaryName")) {
      rbFSend(descendantContentClass, "setTemporaryName", "rendered_content");
    }

    descendant.contentClass = descendantContentClass;
  },

  registerParser(
    this: BehaviorClass,
    format: string,
    callable: Parser = null,
    block: Parser = null,
  ): void {
    const parser = callable || block || ((itself: string) => itself);
    rbModDefineMethod(this.contentClass, format, function (this: RenderedViewContent) {
      return parser(this.toString());
    });
  },

  tests(this: BehaviorClass, helperClass: string | HelperModule): void {
    if (typeof helperClass === "string") {
      this.helperClass = safeConstantize(
        camelize(
          `${underscore(isSymbol(helperClass) ? symbolToS(helperClass) : helperClass)}_helper`,
        ),
      ) as HelperModule | null;
    } else if (rbObjIsKindOf(helperClass, Module) || isPlainHash(helperClass)) {
      this.helperClass = helperClass;
    }
  },

  determineDefaultHelperClass(this: BehaviorClass, name: string): HelperModule | null {
    return this.determineConstantFromTestName(
      name,
      (constant) =>
        (rbObjIsKindOf(constant, Module) || isPlainHash(constant)) &&
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
    this._helperClass = helperClass;
  },

  get helperClass(): HelperModule | null {
    return (
      (Object.hasOwn(this, "_helperClass") ? this._helperClass : null) ||
      (this._helperClass = this.determineDefaultHelperClass(this.name))
    );
  },

  /** @internal */
  includeHelperModulesBang(this: BehaviorClass): void {
    if (this.helperClass) this.helper(this.helperClass);
    include(this, this._helpers);
  },
} satisfies ThisType<BehaviorClass>;

Behavior.ClassMethods = ClassMethods;

Concern.included.call(Behavior, null, function (this: BehaviorClass) {
  classAttribute.call(this, "contentClass", {
    instanceAccessor: false,
    default: RenderedViewContent,
  });
  const contentClassReader = Object.getOwnPropertyDescriptor(this, "contentClass")!;
  Object.defineProperty(this, "contentClass", {
    ...contentClassReader,
    get(this: BehaviorClass) {
      if (!Object.hasOwn(this, "__class_attr_contentClass")) {
        ClassMethods.inherited.call(rbClassSuperclass(this)!, this);
      }
      return contentClassReader.get!.call(this);
    },
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

async function setupWithController(this: Behavior): Promise<void> {
  const controllerClass = (() => class extends TestController {})();
  this.controller = await controllerClass.new();
  this.request = this.controller.request;
  this.viewFlow = new OutputFlow();
  this.outputBuffer = new OutputBuffer();
  this.rendered = new this.constructor.contentClass("");

  rbModDefineMethod(controllerClass, "_testCase", () => this);
}

function config(this: Behavior): unknown {
  if (rbObjRespondTo(this.controller, "config")) {
    return this.controller.config;
  }
  return null;
}

function render(
  this: Behavior,
  options: Record<string, unknown> | string | object = {},
  localAssigns: Record<string, unknown> = {},
  block?: () => unknown,
): ReturnType<Base["render"]> {
  const contentClass = this.constructor.contentClass;
  this.view().assign(this.viewAssigns());
  const output = this.view().render(options, localAssigns, block);
  if (output instanceof Promise) {
    return output.then((value) => {
      this.rendered = new contentClass(rbStrSend(String(this.rendered), "concat", value)[1]);
      return value;
    });
  }
  this.rendered = new contentClass(rbStrSend(String(this.rendered), "concat", output)[1]);
  return output;
}

function renderedViews(this: Behavior): RenderedViewsCollection {
  return (this._renderedViews ??= new RenderedViewsCollection());
}

export class RenderedViewContent extends stringSuperclass("isBlank") {}

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
      Object.entries(expectedLocals).every(([key, value]) => rbEqual(value, actualLocals![key])),
    );
  }
}

/** @internal */
function documentRootElement(this: Behavior) {
  return Testing.htmlDocument().parse(
    isBlank(this.rendered) ? this.outputBuffer.toStr() : String(this.rendered),
  ).root;
}

interface LocalsView extends Base {
  renderedViews: RenderedViewsCollection;
}

export const Locals = {
  render(
    this: LocalsView,
    options: Record<string, unknown> | string | object = {},
    localAssigns: Record<string, unknown> = {},
    block?: () => unknown,
  ): ReturnType<Base["render"]> {
    if (isPlainHash(options)) {
      const opts = options;
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

/** @internal */
function view(this: Behavior): LocalsView {
  return (this.__view ??= (() => {
    const view = this.controller.viewContext() as LocalsView;
    include(rbObjSingletonClass(view), this._helpers);
    extend(view, Locals);
    view.renderedViews = this.renderedViews();
    view.outputBuffer = this.outputBuffer;
    return view;
  })());
}

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
  mountedHelpers: () => { isMethodDefined(mid: string): boolean };
}

/** @internal */
function methodMissing(this: Behavior, selector: string, ...args: unknown[]): unknown {
  let routes: RoutesHost | false | undefined;
  try {
    routes =
      rbObjRespondTo(this.controller, "_routes") &&
      (this.controller as { _routes: RoutesHost })._routes;
  } catch (e) {
    if (!(e instanceof StandardError)) throw e;
  }

  if (
    routes &&
    (routes.namedRoutes.isRouteDefined(selector) ||
      rbModMethodDefined(routes.mountedHelpers(), selector))
  ) {
    return rbFSend(this.controller, selector, ...args);
  } else {
    const superMethodMissing = (
      ActiveSupportTestCase.prototype as { methodMissing?: (...a: unknown[]) => unknown }
    ).methodMissing;
    if (superMethodMissing !== undefined) return superMethodMissing.call(this, selector, ...args);
    throw new NoMethodError(
      `undefined method '${selector}' for an instance of ${rbObjClassname(this)}`,
      selector,
      args,
      false,
      { receiver: this },
    );
  }
}

/** @internal */
function respondToMissing(this: Behavior, name: string, _includePrivate = false): unknown {
  let routes: RoutesHost | false | undefined;
  try {
    routes =
      rbObjRespondTo(this.controller, "_routes") &&
      (this.controller as { _routes: RoutesHost })._routes;
  } catch (e) {
    if (!(e instanceof StandardError)) throw e;
  }

  return (
    routes &&
    (routes.namedRoutes.isRouteDefined(name) || rbModMethodDefined(routes.mountedHelpers(), name))
  );
}

Behavior.RenderedViewContent = RenderedViewContent;
Behavior.RenderedViewsCollection = RenderedViewsCollection;
Behavior.Locals = Locals;
Behavior.INTERNAL_IVARS = INTERNAL_IVARS;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Behavior` (`actionview/lib/action_view/test_case.rb:446`); the class/interface merge is how a mixin surfaces on the type side. */
export interface TestCase extends Behavior {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TestCase extends ActiveSupportTestCase {
  /** @inlinedFrom ActionDispatch::Routing::UrlFor#initialize rails/v8.0.5.2/actionpack/lib/action_dispatch/routing/url_for.rb:111-114 */
  constructor(name: string) {
    (new.target as unknown as typeof ClassMethods).includeHelperModulesBang.call(
      new.target as unknown as BehaviorClass,
    );
    super(name);
    rbObjIvarSet(this, "@_routes", null);
  }
}

include(TestCase, Behavior);
