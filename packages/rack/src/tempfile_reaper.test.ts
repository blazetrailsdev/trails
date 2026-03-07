import { describe, it, expect } from "vitest";
import { TempfileReaper } from "./tempfile-reaper.js";
import { MockRequest } from "./mock-request.js";
import { RACK_TEMPFILES } from "./constants.js";

class MockTempfile {
  closed = false;
  "close!"() { this.closed = true; }
}

describe("Rack::TempfileReaper", () => {
  let env: Record<string, any>;

  function makeEnv() {
    return MockRequest.envFor("/");
  }

  function call(app: any, e: Record<string, any>) {
    return new TempfileReaper(app).call(e);
  }

  function callWithResponseFinished(app: any, e: Record<string, any>) {
    e["rack.response_finished"] = [] as any[];
    const promise = call(app, e);
    return promise.then((resp) => {
      for (const cb of e["rack.response_finished"]) {
        cb(e, resp[0], resp[1], null);
      }
      return resp;
    }).catch((err) => {
      for (const cb of e["rack.response_finished"]) {
        cb(e, null, null, err);
      }
      throw err;
    });
  }

  it("do nothing (i.e. not bomb out) without env[rack.tempfiles]", async () => {
    env = makeEnv();
    const response = await call(async () => [200, {}, ["Hello, World!"]] as any, env);
    response[2].close();
    expect(response[0]).toBe(200);
  });

  it("does nothing without env[rack.tempfiles] with rack.response_finished", async () => {
    env = makeEnv();
    const response = await callWithResponseFinished(async () => [200, {}, ["Hello, World!"]] as any, env);
    expect(response[0]).toBe(200);
  });

  it("close env[rack.tempfiles] when app raises an error", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1, t2];
    await expect(call(async () => { throw new Error("foo"); }, env)).rejects.toThrow("foo");
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("close env[rack.tempfiles] when app raises an error with rack.response_finished", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1, t2];
    await expect(callWithResponseFinished(async () => { throw new Error("foo"); }, env)).rejects.toThrow("foo");
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("close env[rack.tempfiles] when app raises an non-StandardError", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1, t2];
    await expect(call(async () => { throw new TypeError("foo"); }, env)).rejects.toThrow("foo");
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("close env[rack.tempfiles] when body is closed", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1, t2];
    const resp = await call(async () => [200, {}, ["Hello, World!"]] as any, env);
    resp[2].close();
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("close env[rack.tempfiles] when rack.response_finished", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1, t2];
    await callWithResponseFinished(async () => [200, {}, ["Hello, World!"]] as any, env);
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("initialize env[rack.tempfiles] when not already present", async () => {
    env = makeEnv();
    const tf = new MockTempfile();
    const resp = await call(async (e: any) => {
      e[RACK_TEMPFILES].push(tf);
      return [200, {}, ["Hello, World!"]] as any;
    }, env);
    resp[2].close();
    expect(tf.closed).toBe(true);
  });

  it("append env[rack.tempfiles] when already present", async () => {
    env = makeEnv();
    const t1 = new MockTempfile();
    const t2 = new MockTempfile();
    env[RACK_TEMPFILES] = [t1];
    const resp = await call(async (e: any) => {
      e[RACK_TEMPFILES].push(t2);
      return [200, {}, ["Hello, World!"]] as any;
    }, env);
    resp[2].close();
    expect(t1.closed).toBe(true);
    expect(t2.closed).toBe(true);
  });

  it("handle missing rack.tempfiles on normal response", async () => {
    env = makeEnv();
    const resp = await call(async (e: any) => {
      delete e[RACK_TEMPFILES];
      return [200, {}, ["Hello, World!"]] as any;
    }, env);
    resp[2].close(); // Should not throw
  });

  it("handle missing rack.tempfiles on normal response with rack.response_finished", async () => {
    env = makeEnv();
    await callWithResponseFinished(async (e: any) => {
      delete e[RACK_TEMPFILES];
      return [200, {}, ["Hello, World!"]] as any;
    }, env);
  });

  it("handle missing rack.tempfiles on error", async () => {
    env = makeEnv();
    await expect(call(async (e: any) => {
      delete e[RACK_TEMPFILES];
      throw new Error("Foo");
    }, env)).rejects.toThrow("Foo");
  });

  it("handle missing rack.tempfiles on error with rack.response_finished", async () => {
    env = makeEnv();
    await expect(callWithResponseFinished(async (e: any) => {
      delete e[RACK_TEMPFILES];
      throw new Error("Foo");
    }, env)).rejects.toThrow("Foo");
  });
});
