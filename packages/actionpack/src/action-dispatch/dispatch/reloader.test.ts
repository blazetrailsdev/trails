import { describe, it, expect } from "vitest";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Reloader } from "../middleware/reloader.js";
import type { ExecutorLike, ExecutorState } from "../middleware/executor.js";

class StubReloader implements ExecutorLike {
  prepareHooks: Array<() => void> = [];
  completeHooks: Array<() => void> = [];
  check: () => boolean = () => true;

  toPrepare(fn: () => void) {
    this.prepareHooks.push(fn);
  }
  toComplete(fn: () => void) {
    this.completeHooks.push(fn);
  }

  runBang(_opts?: { reset?: boolean }): ExecutorState {
    const shouldRun = this.check();
    if (shouldRun) for (const h of this.prepareHooks) h();
    return {
      completeBang: () => {
        if (shouldRun) this.completeHooks.forEach((h) => h());
      },
    };
  }

  errorReporter = {
    report() {},
  };
}

async function callAndReturnBody(reloader: StubReloader, app?: RackApp): Promise<any> {
  const innerApp: RackApp = app ?? (async () => [200, {}, "response"] as unknown as RackResponse);
  const mw = new Reloader(innerApp, reloader);
  const [, , body] = await mw.call({} as RackEnv);
  return body;
}

describe("ReloaderTest", () => {
  it("prepare callbacks", async () => {
    const r = new StubReloader();
    let a: number | null = null;
    let b: number | null = null;
    let c: number | null = null;
    r.toPrepare(() => {
      a = b = c = 1;
    });
    r.toPrepare(() => {
      b = c = 2;
    });
    r.toPrepare(() => {
      c = 3;
    });

    expect(a ?? b ?? c).toBeNull();

    await callAndReturnBody(r);

    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
  });

  it("returned body object always responds to close", async () => {
    const body = await callAndReturnBody(new StubReloader());
    expect(typeof body.close).toBe("function");
  });

  it("returned body object always responds to close even if called twice", async () => {
    const r = new StubReloader();
    const b1 = await callAndReturnBody(r);
    b1.close();
    const b2 = await callAndReturnBody(r);
    b2.close();
    expect(typeof b2.close).toBe("function");
  });

  it("condition specifies when to reload", async () => {
    const r = new StubReloader();
    let i = 0;
    let j = 0;
    r.check = () => i < 3;
    r.toPrepare(() => {
      i += 1;
    });
    r.toComplete(() => {
      j += 1;
    });
    const mw = new Reloader(async () => [200, {}, []] as unknown as RackResponse, r);
    for (let n = 0; n < 5; n++) {
      const [, , body] = await mw.call({} as RackEnv);
      (body as any).close();
    }
    expect(i).toBe(3);
    expect(j).toBe(3);
  });

  it("it calls close on underlying object when close is called on body", async () => {
    let closeCalled = false;
    const innerBody = {
      close: () => {
        closeCalled = true;
      },
    };
    const body = await callAndReturnBody(
      new StubReloader(),
      async () => [200, { "content-type": "text/html" }, innerBody] as unknown as RackResponse,
    );
    body.close();
    expect(closeCalled).toBe(true);
  });

  it("complete callbacks are called when body is closed", async () => {
    const r = new StubReloader();
    let completed = false;
    r.toComplete(() => {
      completed = true;
    });
    const body = await callAndReturnBody(r);
    expect(completed).toBe(false);
    body.close();
    expect(completed).toBe(true);
  });

  it("prepare callbacks arent called when body is closed", async () => {
    const r = new StubReloader();
    let prepared = false;
    r.toPrepare(() => {
      prepared = true;
    });
    const body = await callAndReturnBody(r);
    expect(prepared).toBe(true);
    prepared = false;
    body.close();
    expect(prepared).toBe(false);
  });

  it("complete callbacks are called on exceptions", async () => {
    const r = new StubReloader();
    let completed = false;
    r.toComplete(() => {
      completed = true;
    });
    await expect(
      callAndReturnBody(r, async () => {
        throw new Error("error");
      }),
    ).rejects.toThrow("error");
    expect(completed).toBe(true);
  });
});
