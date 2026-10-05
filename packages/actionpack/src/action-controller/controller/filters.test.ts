import { beforeEach, describe, it, expect } from "vitest";
import { assertNothingRaised, assertRaises, type CallbackChain } from "@blazetrails/activesupport";
import { rbInspect, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { type AbstractController } from "../../abstract-controller/base.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import "../../test-helpers/abstract-unit.js";

type Ctor = new () => Base;
let tc: TestCase;

async function testProcess(controller: Ctor | Base, action = "show") {
  tc.controller = typeof controller === "function" ? new controller() : controller;

  return tc.process(action);
}

function beforeActions(klass: typeof Base): unknown[] {
  const filters = (
    klass as unknown as { _processActionCallbacks: CallbackChain }
  )._processActionCallbacks.entries.filter((c) => c.kind === "before");
  return filters.map((c) => c.filter);
}

function nameAs(klass: object, name: string): void {
  Object.defineProperty(klass, "name", { value: name });
}

function rq(): Request {
  return new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "test.host" });
}
async function run(ctrl: Base, action = "show"): Promise<Base> {
  await ctrl.dispatch(action, rq(), new Response());
  return ctrl;
}
function push(name: string, prop = "ranFilter") {
  return (c: AbstractController) => {
    const self = c as any;
    self[prop] ??= [];
    self[prop].push(name);
  };
}

class FT_TestController extends Base {
  async show() {
    await this.render({ inline: "ran action" });
  }

  private ensureLogin() {
    push("ensure_login")(this);
  }

  private cleanUp() {
    push("clean_up", "ranAfterAction")(this);
  }
}
FT_TestController.beforeAction("ensureLogin");
FT_TestController.afterAction("cleanUp");

class FT_ChangingTheRequirementsController extends FT_TestController {
  async goWild() {
    await this.render({ plain: "gobble" });
  }
}
FT_ChangingTheRequirementsController.beforeAction("ensureLogin", { except: ["goWild"] });

class FT_TestMultipleFiltersController extends Base {}
FT_TestMultipleFiltersController.beforeAction("try1");
FT_TestMultipleFiltersController.beforeAction("try2");
FT_TestMultipleFiltersController.beforeAction("try3");
for (const i of [1, 2, 3]) {
  Object.assign(FT_TestMultipleFiltersController.prototype, {
    async [`fail${i}`](this: Base) {
      await this.render({ plain: String(i) });
    },
    [`try${i}`](this: Base) {
      (this as any).try = i;
      if (this.actionName === `fail${i}`) {
        this.head(404);
      }
    },
  });
}

class FT_RenderingController extends Base {
  async show() {
    (this as any).ranAction = true;
    await this.render({ inline: "ran action" });
  }

  private async beforeActionRendering() {
    push("before_action_rendering")(this);
    await this.render({ inline: "something else" });
  }

  private unreachedAfterAction() {
    (this as any).ranFilter.push("unreached_after_action_after_render");
  }
}
FT_RenderingController.beforeAction("beforeActionRendering");
FT_RenderingController.afterAction("unreachedAfterAction");

class FT_RenderingForPrependAfterActionController extends FT_RenderingController {
  private unreachedPrependAfterAction() {
    (this as any).ranFilter.push("unreached_prepend_after_action_after_render");
  }
}
FT_RenderingForPrependAfterActionController.prependAfterAction("unreachedPrependAfterAction");

class FT_BeforeActionRedirectionController extends Base {
  async show() {
    (this as any).ranAction = true;
    await this.render({ inline: "ran show action" });
  }

  async targetOfRedirection() {
    (this as any).ranTargetOfRedirection = true;
    await this.render({ inline: "ran target_of_redirection action" });
  }

  private beforeActionRedirects() {
    push("before_action_redirects")(this);
    this.redirectTo({ action: "target_of_redirection" });
  }

  private unreachedAfterAction() {
    (this as any).ranFilter.push("unreached_after_action_after_redirection");
  }
}
nameAs(FT_BeforeActionRedirectionController, "FilterTest::BeforeActionRedirectionController");
FT_BeforeActionRedirectionController.beforeAction("beforeActionRedirects");
FT_BeforeActionRedirectionController.afterAction("unreachedAfterAction");

class FT_BeforeActionRedirectionForPrependAfterActionController extends FT_BeforeActionRedirectionController {
  private unreachedPrependAfterActionAfterRedirection() {
    (this as any).ranFilter.push("unreached_prepend_after_action_after_redirection");
  }
}
nameAs(
  FT_BeforeActionRedirectionForPrependAfterActionController,
  "FilterTest::BeforeActionRedirectionForPrependAfterActionController",
);
FT_BeforeActionRedirectionForPrependAfterActionController.prependAfterAction(
  "unreachedPrependAfterActionAfterRedirection",
);

class FT_PrependingController extends FT_TestController {
  private wonderfulLife() {
    push("wonderful_life")(this);
  }
}
FT_PrependingController.prependBeforeAction("wonderfulLife");

class FT_SkippingAndLimitedController extends FT_TestController {
  async index() {
    await this.render({ plain: "ok" });
  }

  async public() {
    await this.render({ plain: "ok" });
  }
}
FT_SkippingAndLimitedController.skipBeforeAction("ensureLogin");
FT_SkippingAndLimitedController.beforeAction("ensureLogin", { only: "index" });

class FT_SkippingAndReorderingController extends FT_TestController {
  async index() {
    await this.render({ plain: "ok" });
  }

  private findRecord() {
    push("find_record")(this);
  }
}
FT_SkippingAndReorderingController.skipBeforeAction("ensureLogin");
FT_SkippingAndReorderingController.beforeAction("findRecord");
FT_SkippingAndReorderingController.beforeAction("ensureLogin");

class FT_ConditionalSkippingController extends FT_TestController {
  async login() {
    await this.render({ inline: "ran action" });
  }

  async changePassword() {
    await this.render({ inline: "ran action" });
  }

  private findUser() {
    push("find_user")(this);
  }
}
FT_ConditionalSkippingController.skipBeforeAction("ensureLogin", { only: ["login"] });
FT_ConditionalSkippingController.skipAfterAction("cleanUp", { only: ["login"] });
FT_ConditionalSkippingController.beforeAction("findUser", { only: ["changePassword"] });

class FT_AroundFilter {
  executionLog?: string;

  before(controller: Base) {
    this.executionLog = "before";
    if (rbObjRespondTo(controller, "executionLog"))
      (controller.constructor as any).executionLog += " before aroundfilter ";
    (controller as any).beforeRan = true;
  }

  after(controller: Base) {
    (controller as any)._executionLog = this.executionLog + " and after";
    (controller as any).afterRan = true;
    if (rbObjRespondTo(controller, "executionLog"))
      (controller.constructor as any).executionLog += " after aroundfilter ";
  }

  async around(controller: Base, block: () => Promise<void>) {
    this.before(controller);
    await block();
    this.after(controller);
  }
}

class FT_AppendedAroundFilter {
  before(controller: Base) {
    (controller.constructor as any).executionLog += " before appended aroundfilter ";
  }

  after(controller: Base) {
    (controller.constructor as any).executionLog += " after appended aroundfilter ";
  }

  async around(controller: Base, block: () => Promise<void>) {
    this.before(controller);
    await block();
    this.after(controller);
  }
}

class FT_AroundFilterController extends FT_PrependingController {}
FT_AroundFilterController.aroundAction(new FT_AroundFilter() as never);

class FT_BeforeAfterClassFilterController extends FT_PrependingController {}
{
  const filter = new FT_AroundFilter();
  FT_BeforeAfterClassFilterController.beforeAction(filter as never);
  FT_BeforeAfterClassFilterController.afterAction(filter as never);
}

class FT_MixedFilterController extends FT_PrependingController {
  static executionLog: string;

  constructor() {
    FT_MixedFilterController.executionLog = "";
    super();
  }

  get executionLog() {
    return FT_MixedFilterController.executionLog;
  }
}
FT_MixedFilterController.beforeAction((c) => {
  (c.constructor as any).executionLog += " before procfilter ";
});
FT_MixedFilterController.prependAroundAction(new FT_AroundFilter() as never);
FT_MixedFilterController.afterAction((c) => {
  (c.constructor as any).executionLog += " after procfilter ";
});
FT_MixedFilterController.appendAroundAction(new FT_AppendedAroundFilter() as never);

class OutOfOrder extends Error {}
class FT_MixedSpecializationController extends Base {
  async foo() {
    await this.render({ plain: "foo" });
  }

  async bar() {
    await this.render({ plain: "bar" });
  }

  private first() {
    (this as any)._first = true;
  }

  private second() {
    if (!(this as any)._first) throw new OutOfOrder();
  }
}
FT_MixedSpecializationController.beforeAction("first");
FT_MixedSpecializationController.beforeAction("second", { only: "foo" });

class FT_DynamicDispatchController extends Base {
  private choose() {
    this.actionName = this.params.get("choose") as string;
  }
}
FT_DynamicDispatchController.beforeAction("choose");
for (const action of ["foo", "bar", "baz"]) {
  Object.assign(FT_DynamicDispatchController.prototype, {
    async [action](this: Base) {
      await this.render({ plain: action });
    },
  });
}

class FT_PrependingBeforeAndAfterController extends Base {
  beforeAll() {
    push("before_all")(this);
  }

  afterAll() {
    push("after_all")(this);
  }

  betweenBeforeAllAndAfterAll() {
    push("between_before_all_and_after_all")(this);
  }

  async show() {
    await this.render({ plain: "hello" });
  }
}
FT_PrependingBeforeAndAfterController.prependBeforeAction("beforeAll");
FT_PrependingBeforeAndAfterController.prependAfterAction("afterAll");
FT_PrependingBeforeAndAfterController.beforeAction("betweenBeforeAllAndAfterAll");
FT_PrependingBeforeAndAfterController.afterAction("betweenBeforeAllAndAfterAll");

class ErrorToRescue extends Error {}
nameAs(ErrorToRescue, "FilterTest::ErrorToRescue");

class FT_RescuingAroundFilterWithBlock {
  async around(controller: Base, block: () => Promise<void>) {
    try {
      await block();
    } catch (ex) {
      if (!(ex instanceof ErrorToRescue)) throw ex;
      await controller.render({ plain: `I rescued this: ${rbInspect(ex)}` });
    }
  }
}

class FT_RescuedController extends Base {
  async show() {
    throw new ErrorToRescue("Something made the bad noise.");
  }
}
FT_RescuedController.aroundAction(new FT_RescuingAroundFilterWithBlock() as never);

class FT_ImplicitActionsController extends Base {
  private findOnly() {
    (this as any).only = "Only";
  }

  private findExcept() {
    (this as any).except = "Except";
  }
}
nameAs(FT_ImplicitActionsController, "FilterTest::ImplicitActionsController");
FT_ImplicitActionsController.beforeAction("findOnly", { only: "edit" });
FT_ImplicitActionsController.beforeAction("findExcept", { except: "edit" });

class FT_NonYieldingAroundFilterController extends Base {
  async index() {
    await this.render({ plain: "index" });
  }
}
FT_NonYieldingAroundFilterController.beforeAction(push("filter_one", "filters"));
FT_NonYieldingAroundFilterController.aroundAction(async (c) => {
  (c as any).filters.push("it didn't yield");
});
FT_NonYieldingAroundFilterController.beforeAction(push("action_two", "filters"));
FT_NonYieldingAroundFilterController.afterAction(push("action_three", "filters"));

class FT_ConditionalFilterController extends Base {
  async show() {
    await this.render({ plain: "ran action" });
  }
  async anotherAction() {
    await this.render({ plain: "ran action" });
  }
  async showWithoutAction() {
    await this.render({ plain: "ran action without action" });
  }
}

class FT_ConditionalCollectionFilterController extends FT_ConditionalFilterController {}
FT_ConditionalCollectionFilterController.beforeAction(push("ensure_login"), {
  except: ["showWithoutAction", "anotherAction"],
});

class FT_OnlyConditionSymController extends FT_ConditionalFilterController {}
FT_OnlyConditionSymController.beforeAction(push("ensure_login"), { only: ["show"] });

class FT_ExceptConditionSymController extends FT_ConditionalFilterController {}
FT_ExceptConditionSymController.beforeAction(push("ensure_login"), {
  except: ["showWithoutAction"],
});

class FT_BeforeAndAfterConditionController extends FT_ConditionalFilterController {}
FT_BeforeAndAfterConditionController.beforeAction(push("ensure_login"), { only: ["show"] });
FT_BeforeAndAfterConditionController.afterAction(push("clean_up_tmp"), { only: ["show"] });

class FT_OnlyConditionProcController extends FT_ConditionalFilterController {}
FT_OnlyConditionProcController.beforeAction(
  (c) => {
    (c as any).ranProcAction = true;
  },
  { only: ["show"] },
);

class FT_ExceptConditionProcController extends FT_ConditionalFilterController {}
FT_ExceptConditionProcController.beforeAction(
  (c) => {
    (c as any).ranProcAction = true;
  },
  { except: ["showWithoutAction"] },
);

class FT_OnlyConditionClassController extends FT_ConditionalFilterController {}
FT_OnlyConditionClassController.beforeAction(
  (c) => {
    (c as any).ranClassAction = true;
  },
  { only: ["show"] },
);

class FT_ExceptConditionClassController extends FT_ConditionalFilterController {}
FT_ExceptConditionClassController.beforeAction(
  (c) => {
    (c as any).ranClassAction = true;
  },
  { except: ["showWithoutAction"] },
);

class FT_AnomalousYetValidConditionController extends FT_ConditionalFilterController {}
FT_AnomalousYetValidConditionController.beforeAction(push("ensure_login"), {
  except: ["showWithoutAction"],
});
FT_AnomalousYetValidConditionController.beforeAction(
  (c) => {
    (c as any).ranClassAction = true;
  },
  { except: ["showWithoutAction"] },
);
FT_AnomalousYetValidConditionController.beforeAction(
  (c) => {
    (c as any).ranProcAction1 = true;
  },
  { except: ["showWithoutAction"] },
);
FT_AnomalousYetValidConditionController.beforeAction(
  (c) => {
    (c as any).ranProcAction2 = true;
  },
  { except: ["showWithoutAction"] },
);

class FT_OnlyConditionalOptionsFilter extends FT_ConditionalFilterController {}
FT_OnlyConditionalOptionsFilter.beforeAction(
  (c) => {
    (c as any).ranConditionalIndexProc = true;
  },
  { only: ["index"], if: () => true },
);

class FT_ConditionalOptionsFilter extends FT_ConditionalFilterController {}
FT_ConditionalOptionsFilter.beforeAction(push("ensure_login"), { if: () => true });
FT_ConditionalOptionsFilter.beforeAction(push("clean_up_tmp"), { if: () => false });

class FT_ConditionalOptionsSkipFilter extends FT_ConditionalFilterController {
  private ensureLogin() {
    push("ensure_login")(this);
  }
  private cleanUpTmp() {
    push("clean_up_tmp")(this);
  }
}
FT_ConditionalOptionsSkipFilter.beforeAction("ensureLogin");
FT_ConditionalOptionsSkipFilter.beforeAction("cleanUpTmp");
FT_ConditionalOptionsSkipFilter.skipBeforeAction("ensureLogin", { if: () => false });
FT_ConditionalOptionsSkipFilter.skipBeforeAction("cleanUpTmp", { if: () => true });

const _sfuoaEnsureLogin = push("ensure_login");
const _sfuoaCleanUpTmp = push("clean_up_tmp");
class FT_SkipFilterUsingOnlyAndIf extends FT_ConditionalFilterController {
  async login() {
    await this.render({ plain: "ok" });
  }
}
FT_SkipFilterUsingOnlyAndIf.beforeAction(_sfuoaCleanUpTmp);
FT_SkipFilterUsingOnlyAndIf.beforeAction(_sfuoaEnsureLogin);
FT_SkipFilterUsingOnlyAndIf.skipBeforeAction(_sfuoaEnsureLogin, {
  only: ["login"],
  if: () => false,
});
FT_SkipFilterUsingOnlyAndIf.skipBeforeAction(_sfuoaCleanUpTmp, { only: ["login"], if: () => true });

const _sfuiaeEnsureLogin = push("ensure_login");
const _sfuiaeCleanUpTmp = push("clean_up_tmp");
class FT_SkipFilterUsingIfAndExcept extends FT_ConditionalFilterController {
  async login() {
    await this.render({ plain: "ok" });
  }
}
FT_SkipFilterUsingIfAndExcept.beforeAction(_sfuiaeCleanUpTmp);
FT_SkipFilterUsingIfAndExcept.beforeAction(_sfuiaeEnsureLogin);
FT_SkipFilterUsingIfAndExcept.skipBeforeAction(_sfuiaeEnsureLogin, {
  if: () => false,
  except: ["login"],
});
FT_SkipFilterUsingIfAndExcept.skipBeforeAction(_sfuiaeCleanUpTmp, {
  if: () => true,
  except: ["login"],
});

class FT_ConditionalParentOfConditionalSkippingController extends FT_ConditionalFilterController {
  private conditionalInParentBefore() {
    push("conditional_in_parent_before")(this);
  }

  private conditionalInParentAfter() {
    push("conditional_in_parent_after")(this);
  }
}
FT_ConditionalParentOfConditionalSkippingController.beforeAction("conditionalInParentBefore", {
  only: ["show", "anotherAction"],
});
FT_ConditionalParentOfConditionalSkippingController.afterAction("conditionalInParentAfter", {
  only: ["show", "anotherAction"],
});

class FT_ChildOfConditionalParentController extends FT_ConditionalParentOfConditionalSkippingController {}
FT_ChildOfConditionalParentController.skipBeforeAction("conditionalInParentBefore", {
  only: "anotherAction",
});
FT_ChildOfConditionalParentController.skipAfterAction("conditionalInParentAfter", {
  only: "anotherAction",
});

class FT_AnotherChildOfConditionalParentController extends FT_ConditionalParentOfConditionalSkippingController {}
FT_AnotherChildOfConditionalParentController.skipBeforeAction("conditionalInParentBefore", {
  only: "show",
});

const classFilterFn = (c: AbstractController) => {
  (c as any).ranClassAction = true;
};
class FT_ClassController extends FT_ConditionalFilterController {}
FT_ClassController.beforeAction(classFilterFn);

describe("FilterTest", () => {
  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
  });

  it("non yielding around actions do not raise", async () => {
    await expect(run(new FT_NonYieldingAroundFilterController(), "index")).resolves.toBeDefined();
  });

  it("around action can use yield inline with passed action", async () => {
    class C extends Base {
      values: string[] = [];
      async index() {
        this.values.push("action");
        await this.render({ plain: "index" });
      }
    }
    C.aroundAction(async (c, next) => {
      (c as C).values.push("before");
      await next();
      (c as C).values.push("after");
    });
    const ctrl = new C();
    await expect(run(ctrl, "index")).resolves.toBeDefined();
    expect(ctrl.values).toEqual(["before", "action", "after"]);
  });

  it("after actions are not run if around action does not yield", async () => {
    const c = await run(new FT_NonYieldingAroundFilterController(), "index");
    expect((c as any).filters).toEqual(["filter_one", "it didn't yield"]);
  });

  it("added action to inheritance graph", () => {
    expect(beforeActions(FT_TestController)).toEqual([":ensureLogin"]);
  });

  it("base class in isolation", () => {
    expect(beforeActions(Base)).toEqual([]);
  });

  it("prepending action", () => {
    expect(beforeActions(FT_PrependingController)).toEqual([":wonderfulLife", ":ensureLogin"]);
  });

  it("running actions", async () => {
    const c = await run(new FT_PrependingController());
    expect((c as any).ranFilter).toEqual(["wonderful_life", "ensure_login"]);
  });

  it("running actions with proc", async () => {
    class C extends FT_PrependingController {}
    C.beforeAction((c) => {
      (c as any).ranProcAction = true;
    });
    expect(((await run(new C())) as any).ranProcAction).toBe(true);
  });

  it("running actions with implicit proc", async () => {
    class C extends FT_PrependingController {}
    C.beforeAction((c) => {
      (c as any).ranProcAction = true;
    });
    expect(((await run(new C())) as any).ranProcAction).toBe(true);
  });

  it("running actions with class", async () => {
    class AuditFilter {
      static before(c: Base) {
        (c as any).wasAudited = true;
      }
    }
    class C extends Base {
      async show() {
        await this.render({ plain: "hello" });
      }
    }
    C.beforeAction((c) => AuditFilter.before(c as Base));
    expect(((await run(new C())) as any).wasAudited).toBe(true);
  });

  it("running anomalous yet valid condition actions", async () => {
    const c1 = await run(new FT_AnomalousYetValidConditionController());
    expect((c1 as any).ranFilter).toEqual(["ensure_login"]);
    expect((c1 as any).ranClassAction).toBe(true);
    expect((c1 as any).ranProcAction1).toBe(true);
    expect((c1 as any).ranProcAction2).toBe(true);
    const c2 = await run(new FT_AnomalousYetValidConditionController(), "showWithoutAction");
    expect((c2 as any).ranFilter).toBeUndefined();
    expect((c2 as any).ranClassAction).toBeUndefined();
    expect((c2 as any).ranProcAction1).toBeUndefined();
    expect((c2 as any).ranProcAction2).toBeUndefined();
  });

  it("running conditional options", async () => {
    const c = await run(new FT_ConditionalOptionsFilter());
    expect((c as any).ranFilter).toEqual(["ensure_login"]);
  });

  it("running conditional skip options", async () => {
    const c = await run(new FT_ConditionalOptionsSkipFilter());
    expect((c as any).ranFilter).toEqual(["ensure_login"]);
  });

  it("if is ignored when used with only", async () => {
    const c = await run(new FT_SkipFilterUsingOnlyAndIf(), "login");
    expect((c as any).ranFilter).toBeUndefined();
  });

  it("except is ignored when used with if", async () => {
    const c = await run(new FT_SkipFilterUsingIfAndExcept(), "login");
    expect((c as any).ranFilter).toEqual(["ensure_login"]);
  });

  it("skipping class actions", async () => {
    expect(((await run(new FT_ClassController())) as any).ranClassAction).toBe(true);
    class Skipped extends FT_ClassController {}
    Skipped.skipBeforeAction(classFilterFn);
    expect(((await run(new Skipped())) as any).ranClassAction).toBeUndefined();
  });

  it("running collection condition actions", async () => {
    expect(((await run(new FT_ConditionalCollectionFilterController())) as any).ranFilter).toEqual([
      "ensure_login",
    ]);
    expect(
      ((await run(new FT_ConditionalCollectionFilterController(), "showWithoutAction")) as any)
        .ranFilter,
    ).toBeUndefined();
    expect(
      ((await run(new FT_ConditionalCollectionFilterController(), "anotherAction")) as any)
        .ranFilter,
    ).toBeUndefined();
  });

  it("running only condition actions", async () => {
    expect(((await run(new FT_OnlyConditionSymController())) as any).ranFilter).toEqual([
      "ensure_login",
    ]);
    expect(
      ((await run(new FT_OnlyConditionSymController(), "showWithoutAction")) as any).ranFilter,
    ).toBeUndefined();
    expect(((await run(new FT_OnlyConditionProcController())) as any).ranProcAction).toBe(true);
    expect(
      ((await run(new FT_OnlyConditionProcController(), "showWithoutAction")) as any).ranProcAction,
    ).toBeUndefined();
    expect(((await run(new FT_OnlyConditionClassController())) as any).ranClassAction).toBe(true);
    expect(
      ((await run(new FT_OnlyConditionClassController(), "showWithoutAction")) as any)
        .ranClassAction,
    ).toBeUndefined();
  });

  it("running except condition actions", async () => {
    expect(((await run(new FT_ExceptConditionSymController())) as any).ranFilter).toEqual([
      "ensure_login",
    ]);
    expect(
      ((await run(new FT_ExceptConditionSymController(), "showWithoutAction")) as any).ranFilter,
    ).toBeUndefined();
    expect(((await run(new FT_ExceptConditionProcController())) as any).ranProcAction).toBe(true);
    expect(
      ((await run(new FT_ExceptConditionProcController(), "showWithoutAction")) as any)
        .ranProcAction,
    ).toBeUndefined();
    expect(((await run(new FT_ExceptConditionClassController())) as any).ranClassAction).toBe(true);
    expect(
      ((await run(new FT_ExceptConditionClassController(), "showWithoutAction")) as any)
        .ranClassAction,
    ).toBeUndefined();
  });

  it("running only condition and conditional options", async () => {
    expect(
      ((await run(new FT_OnlyConditionalOptionsFilter())) as any).ranConditionalIndexProc,
    ).toBeUndefined();
  });

  it("running before and after condition actions", async () => {
    const c1 = await run(new FT_BeforeAndAfterConditionController());
    expect((c1 as any).ranFilter).toEqual(["ensure_login", "clean_up_tmp"]);
    expect(
      ((await run(new FT_BeforeAndAfterConditionController(), "showWithoutAction")) as any)
        .ranFilter,
    ).toBeUndefined();
  });

  it("around action", async () => {
    await testProcess(FT_AroundFilterController);
    expect((tc.controller as any).beforeRan).toBeTruthy();
    expect((tc.controller as any).afterRan).toBeTruthy();
  });

  it("before after class action", async () => {
    await testProcess(FT_BeforeAfterClassFilterController);
    expect((tc.controller as any).beforeRan).toBeTruthy();
    expect((tc.controller as any).afterRan).toBeTruthy();
  });

  it("having properties in around action", async () => {
    await testProcess(FT_AroundFilterController);
    expect((tc.controller as any)._executionLog).toBe("before and after");
  });

  it("prepending and appending around action", async () => {
    await testProcess(FT_MixedFilterController);
    expect(FT_MixedFilterController.executionLog).toBe(
      " before aroundfilter  before procfilter  before appended aroundfilter " +
        " after appended aroundfilter  after procfilter  after aroundfilter ",
    );
  });

  it("rendering breaks actioning chain", async () => {
    const response = await testProcess(FT_RenderingController);
    expect(response.body).toBe("something else");
    expect("ranAction" in tc.controller).toBe(false);
  });

  it("before action rendering breaks actioning chain for after action", async () => {
    await testProcess(FT_RenderingController);
    expect((tc.controller as any).ranFilter).toEqual(["before_action_rendering"]);
    expect("ranAction" in tc.controller).toBe(false);
  });

  it("before action redirects breaks actioning chain for after action", async () => {
    await testProcess(FT_BeforeActionRedirectionController);
    tc.assertResponse("redirect");
    expect(tc.redirectToUrl()).toBe(
      "http://test.host/filter_test/before_action_redirection/target_of_redirection",
    );
    expect((tc.controller as any).ranFilter).toEqual(["before_action_redirects"]);
  });

  it("before action rendering breaks actioning chain for prepend after action", async () => {
    await testProcess(FT_RenderingForPrependAfterActionController);
    expect((tc.controller as any).ranFilter).toEqual(["before_action_rendering"]);
    expect("ranAction" in tc.controller).toBe(false);
  });

  it("before action redirects breaks actioning chain for prepend after action", async () => {
    await testProcess(FT_BeforeActionRedirectionForPrependAfterActionController);
    tc.assertResponse("redirect");
    expect(tc.redirectToUrl()).toBe(
      "http://test.host/filter_test/before_action_redirection_for_prepend_after_action/target_of_redirection",
    );
    expect((tc.controller as any).ranFilter).toEqual(["before_action_redirects"]);
  });

  it("actions with mixed specialization run in order", async () => {
    await assertNothingRaised(async () => {
      const response = await testProcess(FT_MixedSpecializationController, "bar");
      expect(response.body).toBe("bar");
    });

    await assertNothingRaised(async () => {
      const response = await testProcess(FT_MixedSpecializationController, "foo");
      expect(response.body).toBe("foo");
    });
  });

  it("dynamic dispatch", async () => {
    for (const action of ["foo", "bar", "baz"]) {
      tc.request.queryParameters["choose"] = action;
      const response = (await FT_DynamicDispatchController.action(action)(tc.request.env)).at(
        -1,
      ) as Response;
      expect(response.body).toBe(action);
    }
  });

  it("running prepended before and after action", async () => {
    await testProcess(FT_PrependingBeforeAndAfterController);
    expect((tc.controller as any).ranFilter).toEqual([
      "before_all",
      "between_before_all_and_after_all",
      "between_before_all_and_after_all",
      "after_all",
    ]);
  });

  it("skipping and limiting controller", async () => {
    await testProcess(FT_SkippingAndLimitedController, "index");
    expect((tc.controller as any).ranFilter).toEqual(["ensure_login"]);
    await testProcess(FT_SkippingAndLimitedController, "public");
    expect("ranFilter" in tc.controller).toBe(false);
  });

  it("skipping and reordering controller", async () => {
    await testProcess(FT_SkippingAndReorderingController, "index");
    expect((tc.controller as any).ranFilter).toEqual(["find_record", "ensure_login"]);
  });

  it("conditional skipping of actions", async () => {
    await testProcess(FT_ConditionalSkippingController, "login");
    expect("ranFilter" in tc.controller).toBe(false);
    await testProcess(FT_ConditionalSkippingController, "changePassword");
    expect((tc.controller as any).ranFilter).toEqual(["ensure_login", "find_user"]);

    await testProcess(FT_ConditionalSkippingController, "login");
    expect("ranAfterAction" in tc.controller).toBe(false);
    await testProcess(FT_ConditionalSkippingController, "changePassword");
    expect((tc.controller as any).ranAfterAction).toEqual(["clean_up"]);
  });

  it("conditional skipping of actions when parent action is also conditional", async () => {
    await testProcess(FT_ChildOfConditionalParentController);
    expect((tc.controller as any).ranFilter).toEqual([
      "conditional_in_parent_before",
      "conditional_in_parent_after",
    ]);
    await testProcess(FT_ChildOfConditionalParentController, "anotherAction");
    expect("ranFilter" in tc.controller).toBe(false);
  });

  it("condition skipping of actions when siblings also have conditions", async () => {
    await testProcess(FT_ChildOfConditionalParentController);
    expect((tc.controller as any).ranFilter).toEqual([
      "conditional_in_parent_before",
      "conditional_in_parent_after",
    ]);
    await testProcess(FT_AnotherChildOfConditionalParentController);
    expect((tc.controller as any).ranFilter).toEqual(["conditional_in_parent_after"]);
    await testProcess(FT_ChildOfConditionalParentController);
    expect((tc.controller as any).ranFilter).toEqual([
      "conditional_in_parent_before",
      "conditional_in_parent_after",
    ]);
  });

  it("changing the requirements", async () => {
    await testProcess(FT_ChangingTheRequirementsController, "goWild");
    expect("ranFilter" in tc.controller).toBe(false);
  });

  it("a rescuing around action", async () => {
    let response: Awaited<ReturnType<typeof testProcess>> | null = null;
    await assertNothingRaised(async () => {
      response = await testProcess(FT_RescuedController);
    });

    expect(response!.successful).toBe(true);
    expect(response!.body).toBe(
      "I rescued this: #<FilterTest::ErrorToRescue: Something made the bad noise.>",
    );
  });

  it("actions obey only and except for implicit actions", async () => {
    await testProcess(FT_ImplicitActionsController, "show");
    expect((tc.controller as any).except).toBe("Except");
    expect("only" in tc.controller).toBe(false);
    expect(tc.response.body).toBe("show");

    await testProcess(FT_ImplicitActionsController, "edit");
    expect((tc.controller as any).only).toBe("Only");
    expect("except" in tc.controller).toBe(false);
    expect(tc.response.body).toBe("edit");
  });
});

class Before extends Error {}
class After extends Error {}

class PostsController extends Base {
  private async defaultAction() {
    await this.render({ inline: `${this.actionName} called` });
  }
}
for (const action of ["raisesBefore", "raisesAfter", "raisesBoth", "noRaise", "noAction"]) {
  Object.assign(PostsController.prototype, {
    async [action](this: PostsController) {
      await (this as any).defaultAction();
    },
  });
}

class ControllerWithSymbolAsFilter extends PostsController {
  private async raiseBefore(block: () => Promise<void>) {
    throw new Before();
    await block();
  }

  private async raiseAfter(block: () => Promise<void>) {
    await block();
    throw new After();
  }

  private async withoutException(block: () => Promise<void>) {
    const wtf = 1 + 1;

    await block();

    return wtf + 1;
  }
}
ControllerWithSymbolAsFilter.aroundAction("raiseBefore", { only: "raisesBefore" });
ControllerWithSymbolAsFilter.aroundAction("raiseAfter", { only: "raisesAfter" });
ControllerWithSymbolAsFilter.aroundAction("withoutException", { only: "noRaise" });

class ControllerWithFilterClass extends PostsController {
  static YieldingFilter = class YieldingFilter {
    static async around(_controller: Base, block: () => Promise<void>) {
      await block();
      throw new After();
    }
  };
}
ControllerWithFilterClass.aroundAction(ControllerWithFilterClass.YieldingFilter as never, {
  only: "raisesAfter",
});

class ControllerWithFilterInstance extends PostsController {
  static YieldingFilter = class YieldingFilter {
    async around(_controller: Base, block: () => Promise<void>) {
      await block();
      throw new After();
    }
  };
}
ControllerWithFilterInstance.aroundAction(
  new ControllerWithFilterInstance.YieldingFilter() as never,
  {
    only: "raisesAfter",
  },
);

class ControllerWithProcFilter extends PostsController {}
ControllerWithProcFilter.aroundAction(
  async (c, b) => {
    (c as any).before = true;
    await b();
    (c as any).after = true;
  },
  { only: "noRaise" },
);

class ControllerWithNestedFilters extends ControllerWithSymbolAsFilter {}
ControllerWithNestedFilters.aroundAction("raiseBefore", "raiseAfter", "withoutException", {
  only: "raisesBoth",
});

class ControllerWithAllTypesOfFilters extends PostsController {
  private before() {
    push("before")(this);
  }

  private async around(block: () => Promise<void>) {
    (this as any).ranFilter.push("around (before yield)");
    await block();
    (this as any).ranFilter.push("around (after yield)");
  }

  private after() {
    (this as any).ranFilter.push("after");
  }

  private async aroundAgain(block: () => Promise<void>) {
    (this as any).ranFilter.push("around_again (before yield)");
    await block();
    (this as any).ranFilter.push("around_again (after yield)");
  }
}
ControllerWithAllTypesOfFilters.beforeAction("before");
ControllerWithAllTypesOfFilters.aroundAction("around");
ControllerWithAllTypesOfFilters.afterAction("after");
ControllerWithAllTypesOfFilters.aroundAction("aroundAgain");

class ControllerWithTwoLessFilters extends ControllerWithAllTypesOfFilters {}
ControllerWithTwoLessFilters.skipAroundAction("aroundAgain");
ControllerWithTwoLessFilters.skipAfterAction("after");

describe("YieldingAroundFiltersTest", () => {
  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    await tc.beforeSetup();
  });

  it("base", async () => {
    const controller = PostsController;
    await assertNothingRaised(() => testProcess(controller, "noRaise"));
    await assertNothingRaised(() => testProcess(controller, "raisesBefore"));
    await assertNothingRaised(() => testProcess(controller, "raisesAfter"));
    await assertNothingRaised(() => testProcess(controller, "noAction"));
  });

  it("with symbol", async () => {
    const controller = ControllerWithSymbolAsFilter;
    await assertNothingRaised(() => testProcess(controller, "noRaise"));
    await assertRaises([Before], {}, () => testProcess(controller, "raisesBefore"));
    await assertRaises([After], {}, () => testProcess(controller, "raisesAfter"));
    await assertNothingRaised(() => testProcess(controller, "noRaise"));
  });

  it("with class", async () => {
    const controller = ControllerWithFilterClass;
    await assertNothingRaised(() => testProcess(controller, "noRaise"));
    await assertRaises([After], {}, () => testProcess(controller, "raisesAfter"));
  });

  it("with instance", async () => {
    const controller = ControllerWithFilterInstance;
    await assertNothingRaised(() => testProcess(controller, "noRaise"));
    await assertRaises([After], {}, () => testProcess(controller, "raisesAfter"));
  });

  it("with proc", async () => {
    await testProcess(ControllerWithProcFilter, "noRaise");
    expect((tc.controller as any).before).toBeTruthy();
    expect((tc.controller as any).after).toBeTruthy();
  });

  it("nested actions", async () => {
    const controller = ControllerWithNestedFilters;
    await assertNothingRaised(async () => {
      try {
        await testProcess(controller, "raisesBoth");
      } catch (e) {
        if (!(e instanceof Before || e instanceof After)) throw e;
      }
    });
    await assertRaises([Before], {}, async () => {
      try {
        await testProcess(controller, "raisesBoth");
      } catch (e) {
        if (!(e instanceof After)) throw e;
      }
    });
  });

  it("action order with all action types", async () => {
    await testProcess(ControllerWithAllTypesOfFilters, "noRaise");
    expect((tc.controller as any).ranFilter.join(" ")).toBe(
      "before around (before yield) around_again (before yield) around_again (after yield) after around (after yield)",
    );
  });

  it("action order with skip action method", async () => {
    await testProcess(ControllerWithTwoLessFilters, "noRaise");
    expect((tc.controller as any).ranFilter.join(" ")).toBe(
      "before around (before yield) around (after yield)",
    );
  });

  it("first action in multiple before action chain halts", async () => {
    const controller = new FT_TestMultipleFiltersController();
    const response = await testProcess(controller, "fail1");
    expect(response.body).toBe("");
    expect((controller as any).try).toBe(1);
  });

  it("second action in multiple before action chain halts", async () => {
    const controller = new FT_TestMultipleFiltersController();
    const response = await testProcess(controller, "fail2");
    expect(response.body).toBe("");
    expect((controller as any).try).toBe(2);
  });

  it("last action in multiple before action chain halts", async () => {
    const controller = new FT_TestMultipleFiltersController();
    const response = await testProcess(controller, "fail3");
    expect(response.body).toBe("");
    expect((controller as any).try).toBe(3);
  });
});
