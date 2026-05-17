import { beforeEach, describe, expect, it } from "vitest";
import { AbstractController, ActionNotFound } from "./base.js";

// ==========================================================================
// abstract/callbacks_test.rb
// ==========================================================================

// Rails: `set_callback :process_action, :before, :first` registers an
// instance-method-by-name. trails' beforeAction takes a function — we
// pass a closure that calls the named method, which exercises the same
// behavior even though the registration shape differs.
class Callback1 extends AbstractController {
  text?: string;
  first() {
    this.text = "Hello world";
  }
  async index() {
    this.responseBody = this.text ?? null;
  }
}
Callback1.beforeAction((c) => (c as Callback1).first());

describe("TestCallbacks1", () => {
  it("basic callbacks work", async () => {
    const controller = new Callback1();
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello world");
  });
});

class Callback2 extends AbstractController {
  text?: string;
  second?: string;
  aroundz?: string;
  first() {
    this.text = "Hello world";
  }
  _second() {
    this.second = "Goodbye";
  }
  async index() {
    this.responseBody = (this.text ?? "") as string;
  }
}
Callback2.beforeAction((c) => (c as Callback2).first());
Callback2.afterAction((c) => (c as Callback2)._second());
Callback2.aroundAction(async (c, next) => {
  const self = c as Callback2;
  self.aroundz = "FIRST";
  await next();
  self.aroundz += "SECOND";
});

class Callback2Overwrite extends Callback2 {}
Callback2Overwrite.beforeAction((c) => (c as Callback2).first(), { except: ["index"] });

describe("TestCallbacks2", () => {
  let controller: Callback2;
  beforeEach(() => {
    controller = new Callback2();
  });

  it("before_action works", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello world");
  });

  it("after_action works", async () => {
    await controller.processAction("index");
    expect(controller.second).toBe("Goodbye");
  });

  it("around_action works", async () => {
    await controller.processAction("index");
    expect(controller.aroundz).toBe("FIRSTSECOND");
  });

  // BLOCKED: Rails identifies callbacks by name (`:first` symbol), so
  // `before_action :first, except: :index` in a subclass *replaces* the
  // parent's unconditional `:first`. trails identifies callbacks by
  // function reference — no named replacement — so the parent's
  // unconditional callback still fires on :index. ~60 LOC follow-up to
  // add a `name?: string` slot on CallbackOptions and dedup-by-name in
  // the registry.
  it.skip("before_action with overwritten condition", () => {});
});

class Callback3 extends AbstractController {
  text?: string;
  second?: string;
  async index() {
    this.responseBody = this.text ?? null;
  }
}
Callback3.beforeAction((c) => {
  (c as Callback3).text = "Hello world";
});
Callback3.afterAction((c) => {
  (c as Callback3).second = "Goodbye";
});

describe("TestCallbacks3", () => {
  let controller: Callback3;
  beforeEach(() => {
    controller = new Callback3();
  });

  it("before_action works with procs", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello world");
  });

  it("after_action works with procs", async () => {
    await controller.processAction("index");
    expect(controller.second).toBe("Goodbye");
  });
});

class CallbacksWithConditions extends AbstractController {
  list?: string[];
  authenticated?: string;
  _list() {
    this.list = ["Hello", "World"];
  }
  _authenticate() {
    this.list ??= [];
    this.authenticated = "true";
  }
  async index() {
    this.responseBody = (this.list ?? []).join(", ");
  }
  async sekrit_data() {
    this.responseBody = [...(this.list ?? []), this.authenticated].join(", ");
  }
}
CallbacksWithConditions.beforeAction((c) => (c as CallbacksWithConditions)._list(), {
  only: ["index"],
});
CallbacksWithConditions.beforeAction((c) => (c as CallbacksWithConditions)._authenticate(), {
  except: ["index"],
});

describe("TestCallbacksWithConditions", () => {
  let controller: CallbacksWithConditions;
  beforeEach(() => {
    controller = new CallbacksWithConditions();
  });

  it("when :only is specified, a before action is triggered on that action", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello, World");
  });

  it("when :only is specified, a before action is not triggered on other actions", async () => {
    await controller.processAction("sekrit_data");
    expect(controller.responseBody).toBe("true");
  });

  it("when :except is specified, an after action is not triggered on that action", async () => {
    await controller.processAction("index");
    expect(controller.authenticated).toBeUndefined();
  });
});

class CallbacksWithReusedConditions extends AbstractController {
  list?: string[];
  authenticated?: string;
  _list() {
    this.list = ["Hello", "World"];
  }
  _authenticate() {
    this.list ??= [];
    this.authenticated = "true";
  }
  async index() {
    this.responseBody = (this.list ?? []).join(", ");
  }
  async public_data() {
    this.authenticated = "false";
    this.responseBody = this.authenticated;
  }
}
const reusedOpts = { only: ["index"] };
CallbacksWithReusedConditions.beforeAction(
  (c) => (c as CallbacksWithReusedConditions)._list(),
  reusedOpts,
);
CallbacksWithReusedConditions.beforeAction(
  (c) => (c as CallbacksWithReusedConditions)._authenticate(),
  reusedOpts,
);

describe("TestCallbacksWithReusedConditions", () => {
  let controller: CallbacksWithReusedConditions;
  beforeEach(() => {
    controller = new CallbacksWithReusedConditions();
  });

  it("when :only is specified, both actions triggered on that action", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello, World");
    expect(controller.authenticated).toBe("true");
  });

  it("when :only is specified, both actions are not triggered on other actions", async () => {
    await controller.processAction("public_data");
    expect(controller.responseBody).toBe("false");
  });
});

class CallbacksWithArrayConditions extends AbstractController {
  list?: string[];
  authenticated?: string;
  _list() {
    this.list = ["Hello", "World"];
  }
  _authenticate() {
    this.list = [];
    this.authenticated = "true";
  }
  async index() {
    this.responseBody = (this.list ?? []).join(", ");
  }
  async sekrit_data() {
    this.responseBody = [...(this.list ?? []), this.authenticated].join(", ");
  }
}
CallbacksWithArrayConditions.beforeAction((c) => (c as CallbacksWithArrayConditions)._list(), {
  only: ["index", "listy"],
});
CallbacksWithArrayConditions.beforeAction(
  (c) => (c as CallbacksWithArrayConditions)._authenticate(),
  { except: ["index", "listy"] },
);

describe("TestCallbacksWithArrayConditions", () => {
  let controller: CallbacksWithArrayConditions;
  beforeEach(() => {
    controller = new CallbacksWithArrayConditions();
  });

  it("when :only is specified with an array, a before action is triggered on that action", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello, World");
  });

  it("when :only is specified with an array, a before action is not triggered on other actions", async () => {
    await controller.processAction("sekrit_data");
    expect(controller.responseBody).toBe("true");
  });

  it("when :except is specified with an array, an after action is not triggered on that action", async () => {
    await controller.processAction("index");
    expect(controller.authenticated).toBeUndefined();
  });
});

class ChangedConditions extends Callback2 {
  async not_index() {
    this.responseBody = (this.text ?? "") as string;
  }
}
ChangedConditions.beforeAction((c) => (c as Callback2).first(), { only: ["index"] });

describe("TestCallbacksWithChangedConditions", () => {
  let controller: ChangedConditions;
  beforeEach(() => {
    controller = new ChangedConditions();
  });

  it("when a callback is modified in a child with :only, it works for the :only action", async () => {
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Hello world");
  });

  // BLOCKED: same named-callback-replacement gap as TestCallbacks2's
  // "before_action with overwritten condition" — Rails dedups :first by
  // symbol, trails doesn't dedup by function reference, so the parent's
  // unconditional :first still fires on :not_index.
  it.skip("when a callback is modified in a child with :only, it does not work for other actions", () => {});
});

class SetsResponseBody extends AbstractController {
  async index() {
    this.responseBody = "Fail";
  }
  setBody() {
    this.responseBody = "Success";
  }
}
SetsResponseBody.beforeAction((c) => (c as SetsResponseBody).setBody());

describe("TestHalting", () => {
  it("when a callback sets the response body, the action should not be invoked", async () => {
    const controller = new SetsResponseBody();
    await controller.processAction("index");
    expect(controller.responseBody).toBe("Success");
  });
});

class CallbacksWithArgs extends AbstractController {
  text?: string;
  first() {
    this.text = "Hello world";
  }
  async index(extra: string) {
    this.responseBody = (this.text ?? "") + extra;
  }
}
CallbacksWithArgs.beforeAction((c) => (c as CallbacksWithArgs).first());

describe("TestCallbacksWithArgs", () => {
  it("callbacks still work when invoking process with multiple arguments", async () => {
    const controller = new CallbacksWithArgs();
    await controller.processAction("index", " Howdy!");
    expect(controller.responseBody).toBe("Hello world Howdy!");
  });
});

describe("TestCallbacksWithMissingConditions", () => {
  // BLOCKED: raise_on_missing_callback_actions class flag is not ported.
  // The whole "callbacks reference an action that doesn't exist on the
  // controller" diagnostic path is unimplemented (~80 LOC follow-up:
  // validate :only / :except against availableActions at processAction
  // time when the flag is set).
  it.skip("callbacks raise exception when their 'only' condition is a missing action", () => {});
  it.skip("callbacks raise exception when their 'only' array condition contains a missing action", () => {});
  it.skip("callbacks raise exception when their 'except' condition is a missing action", () => {});
  it.skip("callbacks raise exception when their 'except' array condition contains a missing action", () => {});
  it.skip("raised exception message includes the names of callback actions and missing conditional action", () => {});
  it.skip("raised exception message includes a block callback", () => {});
  it.skip("callbacks with both :only and :except options raise an exception with the correct message", () => {});
});

// ==========================================================================
// trails-only coverage — not in Rails callbacks_test.rb but exercises
// real behavior worth keeping. Kept in this file (rather than a separate
// one) so it stays alongside the API under test; test:compare ignores
// these because no Rails counterpart references them.
// ==========================================================================
describe("AbstractController::Base — trails-only", () => {
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
