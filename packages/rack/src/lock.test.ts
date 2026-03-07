import { describe, it, expect } from "vitest";
import { Lock } from "./lock.js";
import { MockRequest } from "./mock-request.js";

class TestLock {
  synchronized = false;
  lock() { this.synchronized = true; }
  unlock() { this.synchronized = false; }
}

describe("Rack::Lock", () => {
  function lockApp(app: any, lock?: any) {
    return new Lock(app, lock || new TestLock());
  }

  it("delegate each", async () => {
    const env = MockRequest.envFor("/");
    const response = {
      closeCalled: false,
      each(fn: (x: string) => void) { ["hi", "mom"].forEach(fn); },
    };
    const app = lockApp(async () => [200, { "content-type": "text/plain" }, response] as any);
    const body = (await app.call(env))[2];
    const list: string[] = [];
    body.each((x: string) => list.push(x));
    expect(list).toEqual(["hi", "mom"]);
  });

  it("delegate to_path", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const res: any = ["Hello World"];
    res.toPath = () => "/tmp/hello.txt";
    const app = new Lock(async () => [200, { "content-type": "text/plain" }, res] as any, lock);
    const body = (await app.call(env))[2];
    expect(typeof body.toPath).toBe("function");
    expect(body.toPath()).toBe("/tmp/hello.txt");
  });

  it("not delegate to_path if body does not implement it", async () => {
    const env = MockRequest.envFor("/");
    const app = lockApp(async () => [200, { "content-type": "text/plain" }, ["Hello World"]] as any);
    const body = (await app.call(env))[2];
    expect(body.toPath).toBeUndefined();
  });

  it("call super on close", async () => {
    const env = MockRequest.envFor("/");
    const response = { closeCalled: false, close() { this.closeCalled = true; } };
    const app = lockApp(async () => [200, { "content-type": "text/plain" }, response] as any);
    await app.call(env);
    expect(response.closeCalled).toBe(false);
    response.close();
    expect(response.closeCalled).toBe(true);
  });

  it("not unlock until body is closed", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const response = {};
    const app = new Lock(async () => [200, { "content-type": "text/plain" }, response] as any, lock);
    expect(lock.synchronized).toBe(false);
    const body = (await app.call(env))[2];
    expect(lock.synchronized).toBe(true);
    body.close();
    expect(lock.synchronized).toBe(false);
  });

  it("return value from app", async () => {
    const env = MockRequest.envFor("/");
    const original = [200, { "content-type": "text/plain" }, ["hi", "mom"]];
    const app = lockApp(async () => original as any);
    const res = await app.call(env);
    expect(res[0]).toBe(200);
    expect(res[1]).toEqual({ "content-type": "text/plain" });
    const items: string[] = [];
    for (const x of res[2]) items.push(x);
    expect(items).toEqual(["hi", "mom"]);
  });

  it("call synchronize on lock", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const app = new Lock(async () => [200, { "content-type": "text/plain" }, ["a", "b", "c"]] as any, lock);
    expect(lock.synchronized).toBe(false);
    await app.call(env);
    expect(lock.synchronized).toBe(true);
  });

  it("unlock if the app raises", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const app = new Lock(async () => { throw new Error("boom"); }, lock);
    await expect(app.call(env)).rejects.toThrow("boom");
    expect(lock.synchronized).toBe(false);
  });

  it("unlock if the app throws", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const app = new Lock(async () => { throw new Error("bacon"); }, lock);
    await expect(app.call(env)).rejects.toThrow("bacon");
    expect(lock.synchronized).toBe(false);
  });

  it("not unlock if an error is raised before the mutex is locked", async () => {
    let unlocked = false;
    const lock = {
      lock() { throw new Error("lock failed"); },
      unlock() { unlocked = true; },
    };
    const env = MockRequest.envFor("/");
    const app = new Lock(async () => [200, { "content-type": "text/plain" }, []] as any, lock);
    await expect(app.call(env)).rejects.toThrow("lock failed");
    expect(unlocked).toBe(false);
  });

  it("unlock if an exception occurs before returning", async () => {
    const lock = new TestLock();
    const env = MockRequest.envFor("/");
    const app = new Lock(async () => { throw new TypeError("frozen"); }, lock);
    await expect(app.call(env)).rejects.toThrow();
    expect(lock.synchronized).toBe(false);
  });

  it("not replace the environment", async () => {
    const env = MockRequest.envFor("/");
    const envId = "env-id-123";
    env._id = envId;
    const app = lockApp(async (innerEnv: any) => [200, { "content-type": "text/plain" }, [innerEnv._id]] as any);
    const [, , body] = await app.call(env);
    const items: string[] = [];
    for (const x of body) items.push(x);
    expect(items).toEqual([envId]);
  });
});
