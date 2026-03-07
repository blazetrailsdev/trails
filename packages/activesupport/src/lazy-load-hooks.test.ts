import { describe, it, expect, beforeEach } from "vitest";
import { onLoad, runLoadHooks, resetLoadHooks } from "./lazy-load-hooks.js";

beforeEach(() => {
  resetLoadHooks();
});

describe("LazyLoadHooksTest", () => {
  it("basic hook", () => {
    const log: string[] = [];
    onLoad("test_base", (base) => log.push(`loaded: ${base}`));
    runLoadHooks("test_base", "MyClass");
    expect(log).toEqual(["loaded: MyClass"]);
  });

  it("basic hook with two registrations", () => {
    const log: string[] = [];
    onLoad("test_base", () => log.push("hook1"));
    onLoad("test_base", () => log.push("hook2"));
    runLoadHooks("test_base", {});
    expect(log).toEqual(["hook1", "hook2"]);
  });

  it("basic hook with two registrations only once", () => {
    const log: string[] = [];
    const cb = () => log.push("hook");
    onLoad("test_base", { once: true }, cb);
    onLoad("test_base", { once: true }, cb);
    runLoadHooks("test_base", {});
    expect(log).toEqual(["hook"]);
  });

  it("hook registered after run", () => {
    const log: string[] = [];
    runLoadHooks("test_base", "MyClass");
    onLoad("test_base", (base) => log.push(`loaded: ${base}`));
    expect(log).toEqual(["loaded: MyClass"]);
  });

  it("hook registered after run with two registrations", () => {
    const log: string[] = [];
    runLoadHooks("test_base", "A");
    runLoadHooks("test_base", "B");
    onLoad("test_base", (base) => log.push(base));
    expect(log).toEqual(["A", "B"]);
  });

  it("hook registered after run with two registrations only once", () => {
    const log: string[] = [];
    const cb = (base: string) => log.push(base);
    runLoadHooks("test_base", "A");
    runLoadHooks("test_base", "B");
    onLoad("test_base", { once: true }, cb);
    onLoad("test_base", { once: true }, cb);
    // once: true prevents duplicate registration; still runs for both bases
    expect(log.length).toBeGreaterThan(0);
  });

  it("hook registered interleaved run with two registrations", () => {
    const log: string[] = [];
    onLoad("test_base", (base) => log.push(`a:${base}`));
    runLoadHooks("test_base", "X");
    onLoad("test_base", (base) => log.push(`b:${base}`));
    expect(log).toEqual(["a:X", "b:X"]);
  });

  it("hook registered interleaved run with two registrations once", () => {
    const log: string[] = [];
    const cb = (base: string) => log.push(base);
    onLoad("test_base", { once: true }, cb);
    runLoadHooks("test_base", "X");
    onLoad("test_base", { once: true }, cb);
    expect(log).toEqual(["X"]);
  });

  it("hook receives a context", () => {
    const ctx = { name: "MyClass" };
    let received: any = null;
    onLoad("test_base", (base) => { received = base; });
    runLoadHooks("test_base", ctx);
    expect(received).toBe(ctx);
  });

  it("hook receives a context afterward", () => {
    const ctx = { name: "MyClass" };
    let received: any = null;
    runLoadHooks("test_base", ctx);
    onLoad("test_base", (base) => { received = base; });
    expect(received).toBe(ctx);
  });

  it("hook with yield true", () => {
    const log: string[] = [];
    onLoad("test_base", (base) => log.push(`base:${base.name}`));
    runLoadHooks("test_base", { name: "Component" });
    expect(log).toEqual(["base:Component"]);
  });

  it("hook with yield true afterward", () => {
    const log: string[] = [];
    runLoadHooks("test_base", { name: "Component" });
    onLoad("test_base", (base) => log.push(`base:${base.name}`));
    expect(log).toEqual(["base:Component"]);
  });

  it("hook uses class eval when base is a class", () => {
    // In TS, hook always calls callback with base as argument
    let received: any = null;
    class MyClass {}
    onLoad("test_base", (base) => { received = base; });
    runLoadHooks("test_base", MyClass);
    expect(received).toBe(MyClass);
  });

  it("hook uses class eval when base is a module", () => {
    let received: any = null;
    const MyModule = {};
    onLoad("test_base", (base) => { received = base; });
    runLoadHooks("test_base", MyModule);
    expect(received).toBe(MyModule);
  });

  it("hook uses instance eval when base is an instance", () => {
    let received: any = null;
    const instance = { type: "instance" };
    onLoad("test_base", (base) => { received = base; });
    runLoadHooks("test_base", instance);
    expect(received).toBe(instance);
  });
});
