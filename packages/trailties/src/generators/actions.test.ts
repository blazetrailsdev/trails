import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerChildProcessAdapter,
  childProcessAdapterConfig,
  type ChildProcessAdapter,
  type SpawnSyncOptions,
  type SpawnSyncResult,
} from "@blazetrails/activesupport";
import { GeneratorBase } from "./base.js";

class TestGenerator extends GeneratorBase {}

interface SpawnCall {
  cmd: string;
  args: string[];
  options?: SpawnSyncOptions;
}

let calls: SpawnCall[] = [];
let nextResult: SpawnSyncResult = { status: 0, signal: null, stdout: "", stderr: "" };
let previousAdapter: string | null;

const testAdapter: ChildProcessAdapter = {
  spawnSync(cmd, args, options) {
    calls.push({ cmd, args, options });
    return nextResult;
  },
};

beforeEach(() => {
  calls = [];
  nextResult = { status: 0, signal: null, stdout: "", stderr: "" };
  registerChildProcessAdapter("trailties-actions-test", testAdapter);
  previousAdapter = childProcessAdapterConfig.adapter;
  childProcessAdapterConfig.adapter = "trailties-actions-test";
});

afterEach(() => {
  childProcessAdapterConfig.adapter = previousAdapter;
});

function makeGen(): TestGenerator {
  return new TestGenerator({ cwd: "/tmp", output: () => {} });
}

describe("ActionsTest", () => {
  it("generate should queue a sub-generator invocation", () => {
    const lines: string[] = [];
    const gen = new TestGenerator({ cwd: "/tmp", output: (m) => lines.push(m) });
    gen.generate("scaffold", "Post", "title:string", "body:text");
    expect(gen.pendingGenerators).toEqual([
      { what: "scaffold", args: ["Post", "title:string", "body:text"] },
    ]);
    expect(lines.some((l) => l.includes("generate") && l.includes("scaffold"))).toBe(true);
  });

  it("git with symbol should run command using git scm", () => {
    makeGen().git("init");
    expect(calls).toEqual([{ cmd: "git", args: ["init"], options: { cwd: "/tmp" } }]);
  });

  it("git with multi-arg string should split into argv", () => {
    makeGen().git("checkout -b feature/new");
    expect(calls).toEqual([
      { cmd: "git", args: ["checkout", "-b", "feature/new"], options: { cwd: "/tmp" } },
    ]);
  });

  it("git with hash containing multi-arg options should split each", () => {
    makeGen().git({ commit: "-m initial" });
    expect(calls).toEqual([
      { cmd: "git", args: ["commit", "-m", "initial"], options: { cwd: "/tmp" } },
    ]);
  });

  it("git with hash should run each command using git scm", () => {
    makeGen().git({ rm: "README", add: "." });
    expect(calls.map((c) => [c.cmd, ...c.args].join(" "))).toEqual(["git rm README", "git add ."]);
  });

  it("rake should run rake with the default environment", () => {
    makeGen().rake("log:clear");
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("rake");
    expect(calls[0].args).toEqual(["log:clear"]);
    expect(calls[0].options?.env?.TRAILS_ENV).toBe("development");
  });

  it("rake with env option should run rake with the env environment", () => {
    makeGen().rake("log:clear", { env: "production" });
    expect(calls[0].options?.env?.TRAILS_ENV).toBe("production");
  });

  it("rake env option should be passed per-call and not mutate adapter env", () => {
    const gen = makeGen();
    gen.rake("log:clear", { env: "production" });
    gen.rake("log:clear");
    expect(calls[0].options?.env?.TRAILS_ENV).toBe("production");
    expect(calls[1].options?.env?.TRAILS_ENV).toBe("development");
  });

  it("rake with sudo option should run rake with sudo", () => {
    makeGen().rake("log:clear", { sudo: true });
    expect(calls[0].cmd).toBe("sudo");
    expect(calls[0].args).toEqual(["rake", "log:clear"]);
  });

  it("rake with capture option should run rake with capture", () => {
    nextResult = { status: 0, signal: null, stdout: "captured output", stderr: "" };
    const out = makeGen().rake("log:clear", { capture: true });
    expect(out).toBe("captured output");
  });

  it("rake with abort_on_failure option should raise on failure", () => {
    nextResult = { status: 1, signal: null, stdout: "", stderr: "boom" };
    expect(() => makeGen().rake("invalid", { abortOnFailure: true })).toThrow(/aborted/);
  });

  it("rake with abort_on_failure should include signal name when killed by signal", () => {
    nextResult = { status: null, signal: "SIGTERM", stdout: "", stderr: "" };
    expect(() => makeGen().rake("slow", { abortOnFailure: true })).toThrow(/SIGTERM/);
  });

  it("rake with abort_on_failure should raise when spawn errored (status null)", () => {
    nextResult = {
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: new Error("ENOENT: command not found"),
    };
    expect(() => makeGen().rake("missing-bin", { abortOnFailure: true })).toThrow(/ENOENT/);
  });

  it("after_install should queue callbacks for later invocation", () => {
    const gen = makeGen();
    const order: number[] = [];
    gen.afterInstall(() => {
      order.push(1);
    });
    gen.afterInstall(() => {
      order.push(2);
    });
    expect(gen.afterInstallCallbacks).toHaveLength(2);
    for (const cb of gen.afterInstallCallbacks) cb();
    expect(order).toEqual([1, 2]);
  });
});
