import { describe, expect, it } from "vitest";
import { Process, env, include } from "@blazetrails/ruby-compat";
import { TestCase } from "../test-case.js";
import { registerSpecType } from "./autorun.js";
import { Isolation, SubprocessCrashed, isForkingEnv } from "./isolation.js";
import { UnexpectedError } from "./assertions.js";

class IsolatedStateTest extends TestCase {}
include(IsolatedStateTest, Isolation);
registerSpecType(/^IsolatedStateTest$/, IsolatedStateTest);

const leaked: string[] = [];

describe("IsolatedStateTest", () => {
  it("runs in a child process", { timeout: 120_000 }, () => {
    expect(env["ISOLATION_TEST"]).toBe("IsolatedStateTest");
    leaked.push("child");
  });

  it("does not leak child state", { timeout: 120_000 }, () => {
    expect(leaked).toEqual([]);
  });
});

describe("IsolationTest", () => {
  it("parent state is untouched by the child", () => {
    expect(leaked).toEqual([]);
  });

  it("does not fork on node", () => {
    expect(isForkingEnv()).toBe(false);
  });

  it("records a crashed subprocess as a failure", async () => {
    class Crashed extends TestCase {
      async runInIsolation() {
        return [new Process.Status({ pid: 1, status: 1, signal: null }), "boom"];
      }
    }
    const test = new Crashed("test_crash");
    const result = await Isolation.run.call(test as never);
    expect(result.failures[0]).toBeInstanceOf(UnexpectedError);
    expect((result.failures[0] as UnexpectedError).error).toBeInstanceOf(SubprocessCrashed);
  });
});
