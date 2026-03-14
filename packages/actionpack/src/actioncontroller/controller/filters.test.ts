import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}
function makeResponse(): Response {
  return new Response();
}

// ==========================================================================
// action_controller/filters_test.rb — Controller-level filters
// ==========================================================================
describe("FilterTest", () => {
  it("before_action on controller", async () => {
    const log: string[] = [];
    class AppController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    AppController.beforeAction(() => {
      log.push("before");
    });

    const c = new AppController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["before", "action"]);
  });

  it("before_action halts with render", async () => {
    class AuthController extends Base {
      async index() {
        this.render({ plain: "protected" });
      }
    }
    AuthController.beforeAction(function (this: any, controller: any) {
      controller.render({ plain: "unauthorized", status: 401 });
      return false;
    });

    const c = new AuthController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.body).toBe("unauthorized");
    expect(c.status).toBe(401);
  });

  it("after_action runs after render", async () => {
    const log: string[] = [];
    class LogController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    LogController.afterAction(() => {
      log.push("after");
    });

    const c = new LogController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["action", "after"]);
  });

  it("around_action wraps controller action", async () => {
    const log: string[] = [];
    class TimingController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    TimingController.aroundAction(async (_c, next) => {
      log.push("start");
      await next();
      log.push("end");
    });

    const c = new TimingController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["start", "action", "end"]);
  });

  it("before_action with only option", async () => {
    const log: string[] = [];
    class OnlyController extends Base {
      async index() {
        this.render({ plain: "index" });
        log.push("index");
      }
      async show() {
        this.render({ plain: "show" });
        log.push("show");
      }
    }
    OnlyController.beforeAction(
      () => {
        log.push("auth");
      },
      { only: ["index"] },
    );

    const c1 = new OnlyController();
    await c1.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["auth", "index"]);

    log.length = 0;
    const c2 = new OnlyController();
    await c2.dispatch("show", makeRequest(), makeResponse());
    expect(log).toEqual(["show"]);
  });

  it("before_action with except option", async () => {
    const log: string[] = [];
    class ExceptController extends Base {
      async index() {
        this.render({ plain: "index" });
        log.push("index");
      }
      async show() {
        this.render({ plain: "show" });
        log.push("show");
      }
    }
    ExceptController.beforeAction(
      () => {
        log.push("log");
      },
      { except: ["show"] },
    );

    const c1 = new ExceptController();
    await c1.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["log", "index"]);

    log.length = 0;
    const c2 = new ExceptController();
    await c2.dispatch("show", makeRequest(), makeResponse());
    expect(log).toEqual(["show"]);
  });

  it("skip_before_action in child controller", async () => {
    const log: string[] = [];
    const authFn = () => {
      log.push("auth");
    };
    class ParentController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    ParentController.beforeAction(authFn);

    class ChildController extends ParentController {}
    ChildController.skipBeforeAction(authFn);

    const c = new ChildController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["action"]);
  });

  it("multiple before_actions run in order", async () => {
    const log: string[] = [];
    class MultiController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    MultiController.beforeAction(() => {
      log.push("first");
    });
    MultiController.beforeAction(() => {
      log.push("second");
    });
    MultiController.beforeAction(() => {
      log.push("third");
    });

    const c = new MultiController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["first", "second", "third", "action"]);
  });

  it("prepend before_action runs before others", async () => {
    const log: string[] = [];
    class PrependController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    PrependController.beforeAction(() => {
      log.push("normal");
    });
    PrependController.beforeAction(
      () => {
        log.push("prepended");
      },
      { prepend: true },
    );

    const c = new PrependController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["prepended", "normal", "action"]);
  });

  it("conditional filter with if", async () => {
    const log: string[] = [];
    class IfController extends Base {
      admin = false;
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    IfController.beforeAction(
      () => {
        log.push("admin-check");
      },
      { if: (c) => (c as any).admin },
    );

    const c1 = new IfController();
    c1.admin = true;
    await c1.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["admin-check", "action"]);

    log.length = 0;
    const c2 = new IfController();
    c2.admin = false;
    await c2.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["action"]);
  });

  it("conditional filter with unless", async () => {
    const log: string[] = [];
    class UnlessController extends Base {
      skipAuth = false;
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    UnlessController.beforeAction(
      () => {
        log.push("auth");
      },
      { unless: (c) => (c as any).skipAuth },
    );

    const c1 = new UnlessController();
    await c1.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["auth", "action"]);

    log.length = 0;
    const c2 = new UnlessController();
    c2.skipAuth = true;
    await c2.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["action"]);
  });

  it("inherited filters from parent controller", async () => {
    const log: string[] = [];
    class ApplicationController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    ApplicationController.beforeAction(() => {
      log.push("app-before");
    });

    class PostsController extends ApplicationController {
      async index() {
        this.render({ plain: "posts" });
        log.push("posts");
      }
    }
    PostsController.beforeAction(() => {
      log.push("posts-before");
    });

    const c = new PostsController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["app-before", "posts-before", "posts"]);
  });

  it("around_action can catch errors", async () => {
    class ErrorController extends Base {
      async index() {
        throw new Error("boom");
      }
    }
    let caught: Error | null = null;
    ErrorController.aroundAction(async (_c, next) => {
      try {
        await next();
      } catch (e) {
        caught = e as Error;
      }
    });

    const c = new ErrorController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(caught).not.toBeNull();
    expect(caught!.message).toBe("boom");
  });

  it("after_action receives controller with action state", async () => {
    let capturedAction = "";
    class StateController extends Base {
      async index() {
        this.render({ plain: "ok" });
      }
    }
    StateController.afterAction((controller) => {
      capturedAction = controller.actionName;
    });

    const c = new StateController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(capturedAction).toBe("index");
  });

  it("around_action has access to action name", async () => {
    let capturedAction = "";
    class NameController extends Base {
      async index() {
        this.render({ plain: "ok" });
      }
    }
    NameController.aroundAction(async (controller, next) => {
      capturedAction = controller.actionName;
      await next();
    });

    const c = new NameController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(capturedAction).toBe("index");
  });

  it("non-yielding around_action prevents action execution", async () => {
    const log: string[] = [];
    class BlockController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    BlockController.aroundAction(async () => {
      log.push("blocked");
    });

    const c = new BlockController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["blocked"]);
  });

  it("after_action not called when around does not yield", async () => {
    const log: string[] = [];
    class NoYieldController extends Base {
      async index() {
        this.render({ plain: "ok" });
        log.push("action");
      }
    }
    NoYieldController.aroundAction(async () => {
      log.push("around");
    });
    NoYieldController.afterAction(() => {
      log.push("after");
    });

    const c = new NoYieldController();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(log).toEqual(["around"]);
  });
});
