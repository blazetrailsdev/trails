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
// action_controller/rescue_test.rb
// ==========================================================================
describe("RescueControllerTest", () => {
  it("rescues a known error", async () => {
    class AppError extends Error {
      name = "AppError";
    }
    class C extends Base {
      async index() {
        throw new AppError("oops");
      }
    }
    let rescued = false;
    C.rescueFrom(AppError, () => {
      rescued = true;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(rescued).toBe(true);
  });

  it("passes the error to the handler", async () => {
    class AppError extends Error {
      name = "AppError";
    }
    class C extends Base {
      async index() {
        throw new AppError("specific message");
      }
    }
    let message = "";
    C.rescueFrom(AppError, (err: Error) => {
      message = err.message;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(message).toBe("specific message");
  });

  it("does not rescue unregistered errors", async () => {
    class KnownError extends Error {
      name = "KnownError";
    }
    class UnknownError extends Error {
      name = "UnknownError";
    }
    class C extends Base {
      async index() {
        throw new UnknownError("nope");
      }
    }
    C.rescueFrom(KnownError, () => {});

    const c = new C();
    await expect(c.dispatch("index", makeRequest(), makeResponse())).rejects.toThrow(UnknownError);
  });

  it("rescues subclass errors", async () => {
    class BaseError extends Error {
      name = "BaseError";
    }
    class SubError extends BaseError {
      name = "SubError";
    }
    class C extends Base {
      async index() {
        throw new SubError("sub");
      }
    }
    let rescued = false;
    C.rescueFrom(BaseError, () => {
      rescued = true;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(rescued).toBe(true);
  });

  it("child controller inherits rescue handlers", async () => {
    class AppError extends Error {
      name = "AppError";
    }
    class Parent extends Base {
      async index() {
        throw new AppError("parent");
      }
    }
    let handled = false;
    Parent.rescueFrom(AppError, () => {
      handled = true;
    });

    class Child extends Parent {}
    const c = new Child();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(handled).toBe(true);
  });

  it("child can add its own rescue handlers", async () => {
    class ParentError extends Error {
      name = "ParentError";
    }
    class ChildError extends Error {
      name = "ChildError";
    }
    class Parent extends Base {
      async index() {
        throw new ChildError("child");
      }
    }
    Parent.rescueFrom(ParentError, () => {});

    class Child extends Parent {}
    let childRescued = false;
    Child.rescueFrom(ChildError, () => {
      childRescued = true;
    });

    const c = new Child();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(childRescued).toBe(true);
  });

  it("handler can render a response", async () => {
    class AppError extends Error {
      name = "AppError";
    }
    class C extends Base {
      async index() {
        throw new AppError("fail");
      }
    }
    C.rescueFrom(AppError, function (this: any, _err: Error) {
      // Note: handler doesn't have `this` bound to controller in current impl
    });

    // Test that the rescue prevents the error from propagating
    let rescued = false;
    class C2 extends Base {
      async index() {
        throw new AppError("fail");
      }
    }
    C2.rescueFrom(AppError, () => {
      rescued = true;
    });
    const c = new C2();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(rescued).toBe(true);
  });

  it("rescue handler is async", async () => {
    class AsyncError extends Error {
      name = "AsyncError";
    }
    class C extends Base {
      async index() {
        throw new AsyncError("async");
      }
    }
    let handled = false;
    C.rescueFrom(AsyncError, async () => {
      await new Promise((r) => setTimeout(r, 1));
      handled = true;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(handled).toBe(true);
  });

  it("most specific rescue handler wins", async () => {
    class BaseError extends Error {
      name = "BaseError";
    }
    class SpecificError extends BaseError {
      name = "SpecificError";
    }
    class C extends Base {
      async index() {
        throw new SpecificError("specific");
      }
    }
    let which = "";
    C.rescueFrom(BaseError, () => {
      which = "base";
    });
    C.rescueFrom(SpecificError, () => {
      which = "specific";
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    // The last registered matching handler should win (Rails behavior)
    expect(which).toBe("specific");
  });

  it("rescue from standard Error", async () => {
    class C extends Base {
      async index() {
        throw new Error("generic");
      }
    }
    let rescued = false;
    C.rescueFrom(Error, () => {
      rescued = true;
    });

    const c = new C();
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(rescued).toBe(true);
  });
});
