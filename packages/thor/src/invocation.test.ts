import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { UndefinedCommandError } from "./error.js";
import type { Invocation } from "./invocation.js";
import { Base } from "./shell.js";
import type { ThorClass } from "./thor.js";
import { capture, silence } from "./test-helpers/helper.js";
import * as invokeFixtures from "./test-helpers/fixtures/invoke.js";

type Invoker = Invocation & { shell: unknown; invokeAll(): Promise<unknown> };
type InvokerClass = (new (...args: unknown[]) => Invoker) & ThorClass;
const { A, B, C, Defined, I, J } = invokeFixtures as unknown as Record<string, InvokerClass>;

describe("Thor::Invocation", () => {
  describe("#invoke", () => {
    it("invokes a command inside another command", async () => {
      expect(await capture(":stdout", () => new A().invoke("two"))).toEqual("2\n3\n");
    });

    it("invokes a command just once", async () => {
      expect(await capture(":stdout", () => new A().invoke("one"))).toEqual("1\n2\n3\n");
    });

    it("invokes a command just once even if they belongs to different classes", async () => {
      expect(await capture(":stdout", () => new Defined().invoke("one"))).toEqual(
        "1\n2\n3\n4\n5\n",
      );
    });

    it("invokes a command with arguments", async () => {
      expect(await new A().invoke("five", [5])).toBe(true);
      expect(await new A().invoke("five", [7])).toBe(false);
    });

    it("invokes the default command if none is given to a Thor class", async () => {
      const content = await capture(":stdout", () => new A().invoke("b"));
      expect(content).toMatch(/Commands/);
      expect(content).toMatch(/LAST_NAME/);
    });

    it("accepts a class as argument without a command to invoke", async () => {
      const content = await capture(":stdout", () => new A().invoke(B));
      expect(content).toMatch(/Commands/);
      expect(content).toMatch(/LAST_NAME/);
    });

    it("accepts a class as argument with a command to invoke", async () => {
      const base = new A([], { last_name: "Valim" });
      expect(await base.invoke(B, "one", ["Jose"])).toEqual("Valim, Jose");
    });

    it("allows customized options to be given", async () => {
      const base = new A([], { last_name: "Wrong" });
      expect(await base.invoke(B, "one", ["Jose"], { last_name: "Valim" })).toEqual("Valim, Jose");
    });

    it("reparses options in the new class", async () => {
      expect(await A.start(["invoker", "--last-name", "Valim"])).toEqual("Valim, Jose");
    });

    it("shares initialize options with invoked class", async () => {
      const options = (await new A([], { foo: ":bar" }).invoke("b:two")) as Map<string, unknown>;
      expect(Object.fromEntries(options)).toEqual({ foo: ":bar" });
    });

    it("uses default options from invoked class if no matching arguments are given", async () => {
      expect(await new A([]).invoke("b:four")).toEqual("default");
    });

    it("overrides default options if options are passed to the invoker", async () => {
      expect(await new A([], { defaulted_value: "not default" }).invoke("b:four")).toEqual(
        "not default",
      );
    });

    it("returns the command chain", async () => {
      expect(await new I().invoke("two")).toEqual([":two"]);

      expect(await J.start(["one", "two"])).toEqual([":one", ":two"]);
    });

    it("dump configuration values to be used in the invoked class", async () => {
      const base = new A();
      expect(((await base.invoke("b:three")) as Invoker).shell).toEqual(base.shell);
    });

    it("allow extra configuration values to be given", async () => {
      const base = new A();
      const shell = new Base.shell!();
      expect(((await base.invoke("b:three", [], {}, { shell: shell })) as Invoker).shell).toEqual(
        shell,
      );
    });

    it("invokes a Thor::Group and all of its commands", async () => {
      expect(await capture(":stdout", () => new A().invoke("c"))).toEqual("1\n2\n3\n");
    });

    it("does not invoke a Thor::Group twice", async () => {
      const base = new A();
      await silence(":stdout", () => base.invoke("c"));
      expect(await capture(":stdout", () => base.invoke("c"))).toBeEmpty();
    });

    it("does not invoke any of Thor::Group commands twice", async () => {
      const base = new A();
      await silence(":stdout", () => base.invoke("c"));
      expect(await capture(":stdout", () => base.invoke("c:one"))).toBeEmpty();
    });

    it("raises Thor::UndefinedCommandError if the command can't be found", async () => {
      await expect(new A().invoke("foo:bar")).rejects.toThrow(UndefinedCommandError);
    });

    it("raises Thor::UndefinedCommandError if the command can't be found even if all commands were already executed", async () => {
      const base = new C();
      await silence(":stdout", () => base.invokeAll());

      await expect(base.invoke("foo:bar")).rejects.toThrow(UndefinedCommandError);
    });

    it("raises an error if a non Thor class is given", async () => {
      await expect(new A().invoke(Object)).rejects.toThrow(
        new RuntimeError("Expected Thor class, got Object"),
      );
    });
  });
});
