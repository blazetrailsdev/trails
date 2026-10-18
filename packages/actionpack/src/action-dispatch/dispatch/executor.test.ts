import { describe, it, expect, beforeEach } from "vitest";
import { Lint, MockRequest } from "@blazetrails/rack";
import type { RackApp, RackResponse } from "@blazetrails/rack";
import {
  Executor as ActiveSupportExecutor,
  assertErrorReported,
  assertNoErrorReported,
  assertRaises,
  assert,
  assertNot,
  assertRespondTo,
} from "@blazetrails/activesupport";
import { Executor } from "../middleware/executor.js";
import { ExceptionWrapper } from "../middleware/exception-wrapper.js";
import { ShowExceptions } from "../middleware/show-exceptions.js";

describe("ExecutorTest", () => {
  class MyBody extends Array {
    private onClose: (() => void) | undefined;

    constructor(block?: () => void) {
      super();
      this.onClose = block;
    }

    foo(): string {
      return "foo";
    }

    bar(): string {
      return "bar";
    }

    close(): void {
      if (this.onClose) this.onClose();
    }
  }

  let executor: typeof ActiveSupportExecutor;

  beforeEach(() => {
    executor = class extends ActiveSupportExecutor {};
  });

  it("returned body object always responds to close", async () => {
    const body = await callAndReturnBody();
    assertRespondTo(body, "close");
  });

  it("returned body object always responds to close even if called twice", async () => {
    let body = await callAndReturnBody();
    assertRespondTo(body, "close");
    await body.close();

    body = await callAndReturnBody();
    assertRespondTo(body, "close");
    await body.close();
  });

  it("it calls close on underlying object when close is called on body", async () => {
    let closeCalled = false;
    const body = await callAndReturnBody(async () => {
      const b = new MyBody(() => {
        closeCalled = true;
      });
      return [200, { "content-type": "text/html" }, b] as unknown as RackResponse;
    });
    await body.close();
    assert(closeCalled);
  });

  it("run callbacks are called before close", async () => {
    let running = false;
    executor.toRun(() => {
      running = true;
    });

    const body = await callAndReturnBody();
    assert(running);

    running = false;
    await body.close();
    assertNot(running);
  });

  it("complete callbacks are called on close", async () => {
    let completed = false;
    executor.toComplete(() => {
      completed = true;
    });

    const body = await callAndReturnBody();
    assertNot(completed);

    await body.close();
    assert(completed);
  });

  it("complete callbacks are called on exceptions", async () => {
    let completed = false;
    executor.toComplete(() => {
      completed = true;
    });

    await callAndReturnBody(async () => {
      throw new Error("error");
    }).catch(() => null);

    assert(completed);
  });

  it("callbacks execute in shared context", async () => {
    let result: unknown = false;
    executor.toRun(function (this: { inSharedContext?: boolean }) {
      this.inSharedContext = true;
    });
    executor.toComplete(function (this: { inSharedContext?: boolean }) {
      result = this.inSharedContext;
    });

    await (await callAndReturnBody()).close();
    assert(result);
    assertNot("inSharedContext" in globalThis);
  });

  it("body abandoned", async () => {
    let total = 0;
    let ran = 0;
    let completed = 0;

    executor.toRun(() => {
      total += 1;
      ran += 1;
    });
    executor.toComplete(() => {
      total += 1;
      completed += 1;
    });

    const app = (async () => [200, {}, []]) as unknown as RackApp;
    const env = MockRequest.envFor("", {});

    const stack = middleware(app);

    const requestsCount = 5;

    for (let i = 0; i < requestsCount; i++) {
      await stack.call(env);
    }

    expect(total).toBe(requestsCount * 2 - 1);
    expect(ran).toBe(requestsCount);
    expect(completed).toBe(requestsCount - 1);
  });

  it("error reporting", async () => {
    let raisedError: unknown = null;
    const errorReport = await assertErrorReported(Error, async () => {
      raisedError = await assertRaises([Error], {}, () =>
        callAndReturnBody(async () => {
          throw new Error();
        }),
      );
    });
    expect(errorReport!.error).toBe(raisedError);
  });

  it("error reporting with show exception", async () => {
    const mw = new Lint(
      new Executor(
        new ShowExceptions(
          new Lint(async () => {
            return (1 as unknown as { add(s: string): never }).add("1");
          }) as never,
          async () => [500, {}, ["Oops"]],
        ) as never,
        executor,
      ) as never,
    );

    const env = MockRequest.envFor("", {});
    const errorReport = await assertErrorReported(Error, async () => {
      await mw.call(env);
    });
    expect(errorReport!.error).toBeInstanceOf(TypeError);
  });

  it("handled error is not reported", async () => {
    class BusinessAsUsual extends Error {
      override name = "BusinessAsUsual";
    }

    const mw = new Lint(
      new Executor(
        new ShowExceptions(
          new Lint(async () => {
            throw new BusinessAsUsual();
          }) as never,
          async () => [418, {}, ["I'm a teapot"]],
        ) as never,
        executor,
      ) as never,
    );

    const env = MockRequest.envFor("", {});
    const old = ExceptionWrapper.rescueResponses;
    ExceptionWrapper.rescueResponses = { BusinessAsUsual: 418 };
    try {
      await assertNoErrorReported(async () => {
        const response = await mw.call(env);
        expect(response[0]).toBe(418);
      });
    } finally {
      ExceptionWrapper.rescueResponses = old;
    }
  });

  async function callAndReturnBody(block?: RackApp): Promise<any> {
    const app = block ?? ((async () => [200, {}, []]) as unknown as RackApp);
    const env = MockRequest.envFor("", {});
    const [, , body] = await middleware(app).call(env);
    return body;
  }

  function middleware(innerApp: RackApp): Lint {
    return new Lint(new Executor(new Lint(innerApp) as never, executor) as never);
  }
});
