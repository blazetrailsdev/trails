import { describe, it, expect, afterEach } from "vitest";
import { Lint, MockRequest } from "@blazetrails/rack";
import type { RackApp } from "@blazetrails/rack";
import {
  Reloader as ActiveSupportReloader,
  assert,
  assertNil,
  assertNot,
  assertRespondTo,
} from "@blazetrails/activesupport";
import { Reloader } from "../../../lib/action-dispatch/middleware/reloader.js";

describe("ReloaderTest", () => {
  afterEach(() => {
    ActiveSupportReloader.resetCallbacks("prepare");
    ActiveSupportReloader.resetCallbacks("complete");
    _reloader = undefined;
  });

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

  it("prepare callbacks", async () => {
    let a: number | null = null;
    let b: number | null = null;
    let c: number | null = null;
    reloader().toPrepare(() => {
      a = b = c = 1;
    });
    reloader().toPrepare(() => {
      b = c = 2;
    });
    reloader().toPrepare(() => {
      c = 3;
    });

    assertNil(a ?? b ?? c);

    await callAndReturnBody();

    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
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

  it("condition specifies when to reload", async () => {
    let i = 0;
    let j = 0;

    const r = reloader(() => i < 3);
    r.toPrepare(() => {
      i += 1;
    });
    r.toComplete(() => {
      j += 1;
    });

    const app = middleware((async () => [200, {}, []]) as unknown as RackApp, r);
    const env = MockRequest.envFor("", {});
    for (let n = 0; n < 5; n++) {
      const resp = await app.call(env);
      await resp[2].close();
    }
    expect(i).toBe(3);
    expect(j).toBe(3);
  });

  it("it calls close on underlying object when close is called on body", async () => {
    let closeCalled = false;
    const body = await callAndReturnBody((async () => {
      const b = new MyBody(() => {
        closeCalled = true;
      });
      return [200, { "content-type": "text/html" }, b];
    }) as unknown as RackApp);
    await body.close();
    assert(closeCalled);
  });

  it("complete callbacks are called when body is closed", async () => {
    let completed = false;
    reloader().toComplete(() => {
      completed = true;
    });

    const body = await callAndReturnBody();
    assertNot(completed);

    await body.close();
    assert(completed);
  });

  it("prepare callbacks arent called when body is closed", async () => {
    let prepared: boolean;
    reloader().toPrepare(() => {
      prepared = true;
    });

    const body = await callAndReturnBody();
    prepared = false;

    await body.close();
    assertNot(prepared);
  });

  it("complete callbacks are called on exceptions", async () => {
    let completed = false;
    reloader().toComplete(() => {
      completed = true;
    });

    await callAndReturnBody((async () => {
      throw new Error("error");
    }) as unknown as RackApp).catch(() => null);

    assert(completed);
  });

  async function callAndReturnBody(block?: RackApp): Promise<any> {
    const app = block ?? ((async () => [200, {}, "response"]) as unknown as RackApp);
    const env = MockRequest.envFor("", {});
    const [, , body] = await middleware(app).call(env);
    return body;
  }

  function middleware(innerApp: RackApp, r: typeof ActiveSupportReloader = reloader()): Lint {
    return new Lint(new Reloader(new Lint(innerApp) as never, r as never) as never);
  }

  let _reloader: typeof ActiveSupportReloader | undefined;

  function reloader(check: () => boolean = () => true): typeof ActiveSupportReloader {
    return (_reloader ??= (() => {
      const reloader = class extends ActiveSupportReloader {};
      reloader.check = check;
      return reloader;
    })());
  }
});
