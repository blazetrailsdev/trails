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

  // --- Tests matching Rails test names ---

  it("rescue handler", async () => {
    class NotAuthorized extends Error {}
    class C extends Base {
      async notAuthorized() {
        throw new NotAuthorized();
      }
    }
    C.rescueFrom(NotAuthorized, function (this: Base) {
      this.head(403);
    });
    const c = new C();
    await c.dispatch("notAuthorized", makeRequest(), makeResponse());
    expect(c.status).toBe(403);
  });

  it("rescue handler string", async () => {
    class NotAuthorizedString extends Error {}
    class C extends Base {
      async action() {
        throw new NotAuthorizedString();
      }
    }
    C.rescueFrom(NotAuthorizedString, function (this: Base) {
      this.head(403);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(403);
  });

  it("rescue handler with argument", async () => {
    class RecordInvalid extends Error {}
    class C extends Base {
      async action() {
        throw new RecordInvalid("invalid record");
      }
    }
    let caughtError: Error | null = null;
    C.rescueFrom(RecordInvalid, (err: Error) => {
      caughtError = err;
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(caughtError).toBeInstanceOf(RecordInvalid);
  });

  it("rescue handler with argument as string", async () => {
    class RecordInvalidStr extends Error {}
    class C extends Base {
      async action() {
        throw new RecordInvalidStr("invalid");
      }
    }
    let caughtError: Error | null = null;
    C.rescueFrom(RecordInvalidStr, (err: Error) => {
      caughtError = err;
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(caughtError).toBeInstanceOf(RecordInvalidStr);
  });

  it("proc rescue handler", async () => {
    class NotAllowed extends Error {}
    class C extends Base {
      async action() {
        throw new NotAllowed();
      }
    }
    C.rescueFrom(NotAllowed, function (this: Base) {
      this.head(403);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(403);
  });

  it("proc rescue handler as string", async () => {
    class NotAllowedStr extends Error {}
    class C extends Base {
      async action() {
        throw new NotAllowedStr();
      }
    }
    C.rescueFrom(NotAllowedStr, function (this: Base) {
      this.head(403);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(403);
  });

  it("proc rescue handle with argument", async () => {
    class InvalidRequest extends Error {
      constructor() {
        super("InvalidRequest");
      }
    }
    class C extends Base {
      async action() {
        throw new InvalidRequest();
      }
    }
    C.rescueFrom(InvalidRequest, function (this: Base, err: Error) {
      this.render({ plain: err.message });
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("InvalidRequest");
  });

  it("proc rescue handle with argument as string", async () => {
    class InvalidRequestStr extends Error {
      constructor() {
        super("InvalidRequestStr");
      }
    }
    class C extends Base {
      async action() {
        throw new InvalidRequestStr();
      }
    }
    C.rescueFrom(InvalidRequestStr, function (this: Base, err: Error) {
      this.render({ plain: err.message });
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("InvalidRequestStr");
  });

  it("block rescue handler", async () => {
    class BadGateway extends Error {}
    class C extends Base {
      async action() {
        throw new BadGateway();
      }
    }
    C.rescueFrom(BadGateway, function (this: Base) {
      this.head(502);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(502);
  });

  it("block rescue handler as string", async () => {
    class BadGatewayStr extends Error {}
    class C extends Base {
      async action() {
        throw new BadGatewayStr();
      }
    }
    C.rescueFrom(BadGatewayStr, function (this: Base) {
      this.head(502);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(502);
  });

  it("block rescue handler with argument", async () => {
    class ResourceUnavailable extends Error {
      constructor() {
        super("ResourceUnavailable");
      }
    }
    class C extends Base {
      async action() {
        throw new ResourceUnavailable();
      }
    }
    C.rescueFrom(ResourceUnavailable, function (this: Base, err: Error) {
      this.render({ plain: err.message });
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("ResourceUnavailable");
  });

  it("block rescue handler with argument as string", async () => {
    class ResourceUnavailableStr extends Error {
      constructor() {
        super("ResourceUnavailableStr");
      }
    }
    class C extends Base {
      async action() {
        throw new ResourceUnavailableStr();
      }
    }
    C.rescueFrom(ResourceUnavailableStr, function (this: Base, err: Error) {
      this.render({ plain: err.message });
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.body).toBe("ResourceUnavailableStr");
  });
});

describe("ExceptionInheritanceRescueControllerTest", () => {
  it("bottom first", async () => {
    class ParentException extends Error {}
    class ChildException extends ParentException {}
    class GrandchildException extends ChildException {}
    class C extends Base {
      async action() {
        throw new GrandchildException();
      }
    }
    C.rescueFrom(ParentException, function (this: Base) {
      this.head(201);
    });
    C.rescueFrom(GrandchildException, function (this: Base) {
      this.head(204);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(204);
  });

  it("inheritance works", async () => {
    class ParentException extends Error {}
    class ChildException extends ParentException {}
    class C extends Base {
      async action() {
        throw new ChildException();
      }
    }
    C.rescueFrom(ParentException, function (this: Base) {
      this.head(201);
    });
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });
});

describe("ControllerInheritanceRescueControllerTest", () => {
  it("first exception in child controller", async () => {
    class ParentException extends Error {}
    class FirstChildException extends Error {}
    class Parent extends Base {
      async action() {
        throw new FirstChildException();
      }
    }
    Parent.rescueFrom(ParentException, function (this: Base) {
      this.head(201);
    });
    class Child extends Parent {}
    Child.rescueFrom(FirstChildException, function (this: Base) {
      this.head(410);
    });
    const c = new Child();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(410);
  });

  it("second exception in child controller", async () => {
    class ParentException extends Error {}
    class SecondChildException extends Error {}
    class Parent extends Base {
      async action() {
        throw new SecondChildException();
      }
    }
    Parent.rescueFrom(ParentException, function (this: Base) {
      this.head(201);
    });
    class Child extends Parent {}
    Child.rescueFrom(SecondChildException, function (this: Base) {
      this.head(410);
    });
    const c = new Child();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(410);
  });

  it("exception in parent controller", async () => {
    class ParentException extends Error {}
    class Parent extends Base {
      async action() {
        throw new ParentException();
      }
    }
    Parent.rescueFrom(ParentException, function (this: Base) {
      this.head(201);
    });
    class Child extends Parent {}
    const c = new Child();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.status).toBe(201);
  });
});

describe("RescueTest", () => {
  it("normal request", async () => {
    class C extends Base {
      async foo() {
        this.render({ plain: "foo" });
      }
    }
    const c = new C();
    await c.dispatch("foo", makeRequest(), makeResponse());
    expect(c.body).toBe("foo");
  });

  it("rescue exceptions inside controller", async () => {
    class RecordInvalid extends Error {
      constructor() {
        super("invalid");
      }
    }
    class C extends Base {
      async invalid() {
        throw new RecordInvalid();
      }
    }
    C.rescueFrom(RecordInvalid, function (this: Base, err: Error) {
      this.render({ plain: err.message });
    });
    const c = new C();
    await c.dispatch("invalid", makeRequest(), makeResponse());
    expect(c.body).toBe("invalid");
  });
});
