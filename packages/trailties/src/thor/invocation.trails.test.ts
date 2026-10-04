import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Actions } from "./actions.js";
import type { BaseConfig } from "./base.js";
import type { Invocation } from "./invocation.js";
import { Thor, type ThorClass } from "./thor.js";

type Instance = Invocation & {
  shell: object;
  destinationRoot: string;
  parentOptions: unknown;
  options: unknown;
  log: string[];
};

class A extends Thor {
  log: string[] = [];
  static {
    (this as unknown as ThorClass).desc("one", "one");
    (this as unknown as ThorClass).methodAdded("one");
    (this as unknown as ThorClass).desc("two", "two");
    (this as unknown as ThorClass).methodAdded("two");
  }
  async one() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.log.push("one");
    return 1;
  }
  two() {
    this.log.push("two");
    return 2;
  }
}

class B extends Thor {
  static dispatched: unknown[] = [];
  static {
    include(this, Actions);
    (this as unknown as ThorClass).desc("hello", "hello");
    (this as unknown as ThorClass).methodAdded("hello");
  }
  static async dispatch(
    command: unknown,
    givenArgs: unknown,
    givenOpts: unknown,
    config: BaseConfig,
    block?: (instance: never) => void,
  ) {
    const instance = { parentOptions: null as unknown };
    block?.(instance as never);
    B.dispatched = [command, givenArgs, givenOpts, config, instance.parentOptions];
    return "dispatched";
  }
  hello() {}
}

const build = <T>(klass: new (...args: never[]) => T, ...args: unknown[]) =>
  new (klass as unknown as new (...args: unknown[]) => Instance)(...args);

describe("Thor::Invocation", () => {
  it("initialize records the initializer beneath Shell and Actions", () => {
    const config = { destinationRoot: "/tmp/thor-invocation" };
    const b = build(B, ["x"], { foo: "bar" }, config);
    expect(b._initializer).toEqual([["x"], { foo: "bar" }, config]);
    expect(b.shell).toBeDefined();
    expect(b.destinationRoot).toBe("/tmp/thor-invocation");
    expect(b._sharedConfiguration()).toEqual({
      invocations: b._invocations,
      shell: b.shell,
      destinationRoot: "/tmp/thor-invocation",
    });
  });

  it("prepare_for_invocation answers a class as given", () => {
    const klass = A as unknown as { prepareForInvocation(key: unknown, name: unknown): unknown };
    expect(klass.prepareForInvocation(null, B)).toBe(B);
  });

  it("invoke_command runs a command once per class", async () => {
    const a = build(A);
    const one = (A as unknown as { allCommands(): Record<string, never> }).allCommands().one;
    expect(await a.invokeCommand(one)).toBe(1);
    expect(await a.invokeCommand(one)).toBeUndefined();
    expect(a.log).toEqual(["one"]);
    expect(a.currentCommandChain()).toEqual([":one"]);
    expect(a.invokeTask).toBe(a.invokeCommand);
  });

  it("invoke_all awaits each command in order", async () => {
    const shell = { say: () => {}, printTable: () => {} };
    const a = build(A, [], {}, { shell });
    const result = (await a.invokeAll()).filter((r) => r != null);
    expect(result).toEqual([1, 2]);
    expect(a.log).toEqual(["one", "two"]);
  });

  it("invoke dispatches to the class with the shared configuration", async () => {
    const a = build(A, [], { foo: "bar" });
    expect(await a.invoke(B, "hello", ["Jose"])).toBe("dispatched");
    const [command, args, opts, config, parentOptions] = B.dispatched;
    expect(command).toBe("hello");
    expect(args).toEqual(["Jose"]);
    expect(opts).toEqual({ foo: "bar" });
    expect((config as BaseConfig).invocations).toBe(a._invocations);
    expect((config as BaseConfig).shell).toBe(a.shell);
    expect(parentOptions).toBe(a.options);

    await a.invoke(B, ["Erik"], { style: "foo" });
    expect(B.dispatched.slice(0, 3)).toEqual([null, ["Erik"], { style: "foo" }]);
  });

  it("invoke retrieves a command of the current class by name", async () => {
    const a = build(A);
    expect(a._retrieveClassAndCommand("two")).toEqual([A, "two"]);
    expect(a._retrieveClassAndCommand(null)).toEqual([A, null]);
    expect(a._retrieveClassAndCommand(B, "hello")).toEqual([B, "hello"]);
  });

  it("invoke_with_padding restores the padding once the invocation settles", async () => {
    const a = build(A);
    const shell = a.shell as { padding: number };
    const pending = a.invokeWithPadding(B, "hello");
    expect(shell.padding).toBe(1);
    await pending;
    expect(shell.padding).toBe(0);
  });
});
