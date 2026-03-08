import { describe, it, expect } from "vitest";
import { AbstractController, ActionNotFound } from "./abstract-controller.js";

// ==========================================================================
// abstract/callbacks_test.rb
// ==========================================================================
describe("AbstractController::Callbacks", () => {
  it("basic callbacks work", async () => {
    const log: string[] = [];
    class TestController extends AbstractController {
      async index() { log.push("action"); }
    }
    TestController.beforeAction(() => { log.push("before"); });
    TestController.afterAction(() => { log.push("after"); });

    const c = new TestController();
    await c.processAction("index");
    expect(log).toEqual(["before", "action", "after"]);
  });

  it("before action can halt chain", async () => {
    const log: string[] = [];
    class HaltController extends AbstractController {
      async index() { log.push("action"); }
    }
    HaltController.beforeAction(() => { log.push("before"); return false; });

    const c = new HaltController();
    await c.processAction("index");
    expect(log).toEqual(["before"]);
  });

  it("around action wraps execution", async () => {
    const log: string[] = [];
    class AroundController extends AbstractController {
      async index() { log.push("action"); }
    }
    AroundController.aroundAction(async (_c, next) => {
      log.push("around-before");
      await next();
      log.push("around-after");
    });

    const c = new AroundController();
    await c.processAction("index");
    expect(log).toEqual(["around-before", "action", "around-after"]);
  });

  it("non yielding around actions do not raise", async () => {
    const log: string[] = [];
    class NoYieldController extends AbstractController {
      async index() { log.push("action"); }
    }
    NoYieldController.aroundAction(async () => { log.push("around-noyield"); });

    const c = new NoYieldController();
    await c.processAction("index");
    expect(log).toEqual(["around-noyield"]);
  });

  it("after actions are not run if around action does not yield", async () => {
    const log: string[] = [];
    class NoYieldAfterController extends AbstractController {
      async index() { log.push("action"); }
    }
    NoYieldAfterController.aroundAction(async () => { log.push("around"); });
    NoYieldAfterController.afterAction(() => { log.push("after"); });

    const c = new NoYieldAfterController();
    await c.processAction("index");
    expect(log).toEqual(["around"]);
  });

  it("added action to inheritance graph", async () => {
    const log: string[] = [];
    class Parent extends AbstractController {
      async index() { log.push("parent-action"); }
    }
    Parent.beforeAction(() => { log.push("parent-before"); });

    class Child extends Parent {
      async index() { log.push("child-action"); }
    }
    Child.beforeAction(() => { log.push("child-before"); });

    const c = new Child();
    await c.processAction("index");
    expect(log).toEqual(["parent-before", "child-before", "child-action"]);
  });

  it("prepending action", async () => {
    const log: string[] = [];
    class PrependController extends AbstractController {
      async index() { log.push("action"); }
    }
    PrependController.beforeAction(() => { log.push("first"); });
    PrependController.beforeAction(() => { log.push("prepended"); }, { prepend: true });

    const c = new PrependController();
    await c.processAction("index");
    expect(log).toEqual(["prepended", "first", "action"]);
  });

  it("running actions with only condition", async () => {
    const log: string[] = [];
    class OnlyController extends AbstractController {
      async index() { log.push("index"); }
      async show() { log.push("show"); }
    }
    OnlyController.beforeAction(() => { log.push("before"); }, { only: ["index"] });

    const c1 = new OnlyController();
    await c1.processAction("index");
    expect(log).toEqual(["before", "index"]);

    log.length = 0;
    const c2 = new OnlyController();
    await c2.processAction("show");
    expect(log).toEqual(["show"]);
  });

  it("running except condition actions", async () => {
    const log: string[] = [];
    class ExceptController extends AbstractController {
      async index() { log.push("index"); }
      async show() { log.push("show"); }
    }
    ExceptController.beforeAction(() => { log.push("before"); }, { except: ["show"] });

    const c1 = new ExceptController();
    await c1.processAction("index");
    expect(log).toEqual(["before", "index"]);

    log.length = 0;
    const c2 = new ExceptController();
    await c2.processAction("show");
    expect(log).toEqual(["show"]);
  });

  it("running conditional options with if", async () => {
    const log: string[] = [];
    class IfController extends AbstractController {
      shouldRun = true;
      async index() { log.push("action"); }
    }
    IfController.beforeAction(
      () => { log.push("conditional"); },
      { if: (c) => (c as IfController).shouldRun }
    );

    const c1 = new IfController();
    c1.shouldRun = true;
    await c1.processAction("index");
    expect(log).toEqual(["conditional", "action"]);

    log.length = 0;
    const c2 = new IfController();
    c2.shouldRun = false;
    await c2.processAction("index");
    expect(log).toEqual(["action"]);
  });

  it("running conditional options with unless", async () => {
    const log: string[] = [];
    class UnlessController extends AbstractController {
      skipIt = false;
      async index() { log.push("action"); }
    }
    UnlessController.beforeAction(
      () => { log.push("conditional"); },
      { unless: (c) => (c as UnlessController).skipIt }
    );

    const c1 = new UnlessController();
    c1.skipIt = false;
    await c1.processAction("index");
    expect(log).toEqual(["conditional", "action"]);

    log.length = 0;
    const c2 = new UnlessController();
    c2.skipIt = true;
    await c2.processAction("index");
    expect(log).toEqual(["action"]);
  });

  it("skip before action", async () => {
    const log: string[] = [];
    const beforeFn = () => { log.push("before"); };
    class SkipParent extends AbstractController {
      async index() { log.push("action"); }
    }
    SkipParent.beforeAction(beforeFn);

    class SkipChild extends SkipParent {}
    SkipChild.skipBeforeAction(beforeFn);

    const c = new SkipChild();
    await c.processAction("index");
    expect(log).toEqual(["action"]);
  });

  it("multiple before and after actions", async () => {
    const log: string[] = [];
    class MultiController extends AbstractController {
      async index() { log.push("action"); }
    }
    MultiController.beforeAction(() => { log.push("b1"); });
    MultiController.beforeAction(() => { log.push("b2"); });
    MultiController.afterAction(() => { log.push("a1"); });
    MultiController.afterAction(() => { log.push("a2"); });

    const c = new MultiController();
    await c.processAction("index");
    expect(log).toEqual(["b1", "b2", "action", "a2", "a1"]);
  });

  it("before after class action", async () => {
    const log: string[] = [];
    class ClassActionController extends AbstractController {
      async index() { log.push("action"); }
    }
    ClassActionController.beforeAction(() => { log.push("before"); });
    ClassActionController.afterAction(() => { log.push("after"); });

    const c = new ClassActionController();
    await c.processAction("index");
    expect(log).toEqual(["before", "action", "after"]);
  });

  it("having properties in around action", async () => {
    const log: string[] = [];
    class PropsAroundController extends AbstractController {
      async index() { log.push("action"); }
    }
    PropsAroundController.aroundAction(async (controller, next) => {
      log.push(`before-${controller.actionName}`);
      await next();
      log.push(`after-${controller.actionName}`);
    });

    const c = new PropsAroundController();
    await c.processAction("index");
    expect(log).toEqual(["before-index", "action", "after-index"]);
  });

  it("prepending and appending around action", async () => {
    const log: string[] = [];
    class PrependAroundController extends AbstractController {
      async index() { log.push("action"); }
    }
    PrependAroundController.aroundAction(async (_c, next) => {
      log.push("first-around-before");
      await next();
      log.push("first-around-after");
    });
    PrependAroundController.aroundAction(async (_c, next) => {
      log.push("prepended-around-before");
      await next();
      log.push("prepended-around-after");
    }, { prepend: true });

    const c = new PrependAroundController();
    await c.processAction("index");
    expect(log).toEqual([
      "prepended-around-before",
      "first-around-before",
      "action",
      "first-around-after",
      "prepended-around-after",
    ]);
  });
});

// ==========================================================================
// abstract controller base tests
// ==========================================================================
describe("AbstractController::Base", () => {
  it("action name is set", async () => {
    class TestController extends AbstractController {
      async index() {}
    }
    const c = new TestController();
    await c.processAction("index");
    expect(c.actionName).toBe("index");
  });

  it("response body can be set", () => {
    const c = new (class extends AbstractController {})();
    c.responseBody = "hello";
    expect(c.responseBody).toBe("hello");
  });

  it("throws ActionNotFound for missing action", async () => {
    class EmptyController extends AbstractController {}
    const c = new EmptyController();
    await expect(c.processAction("missing")).rejects.toThrow(ActionNotFound);
  });

  it("available actions lists instance methods", () => {
    class MethodController extends AbstractController {
      async index() {}
      async show() {}
    }
    const c = new MethodController();
    const actions = c.availableActions();
    expect(actions).toContain("index");
    expect(actions).toContain("show");
  });

  it("has action", () => {
    class HasActionController extends AbstractController {
      async index() {}
    }
    expect(HasActionController.hasAction("index")).toBe(true);
    expect(HasActionController.hasAction("missing")).toBe(false);
  });

  it("performed starts false", () => {
    const c = new (class extends AbstractController {})();
    expect(c.performed).toBe(false);
  });
});
