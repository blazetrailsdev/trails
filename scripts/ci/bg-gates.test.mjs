import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpec } from "./bg-gates.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "bg-gates.mjs");

function runner(jobs = "2") {
  const dir = mkdtempSync(path.join(tmpdir(), "bg-gates-"));
  const env = { ...process.env, CI_BG_DIR: dir, CI_BG_JOBS: jobs };
  const run = (args, input) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { env, input, encoding: "utf8" });
  return { dir, run };
}

describe("parseSpec", () => {
  it("parses ids, after-edges and commands, skipping blanks and comments", () => {
    expect(
      parseSpec("a: echo 1\n\n# note\nb after a: echo 2 && echo 3\nc after a,b: true\n"),
    ).toEqual([
      { id: "a", after: [], command: "echo 1" },
      { id: "b", after: ["a"], command: "echo 2 && echo 3" },
      { id: "c", after: ["a", "b"], command: "true" },
    ]);
  });

  it("keeps colons and dollar expansions inside the command", () => {
    expect(parseSpec("x: FOO=$(echo a:b) bash -c 'echo $FOO'")[0].command).toBe(
      "FOO=$(echo a:b) bash -c 'echo $FOO'",
    );
  });

  it("rejects a malformed line, a duplicate id, and an edge to a later or unknown task", () => {
    expect(() => parseSpec("no colon here")).toThrow(/unparseable/);
    expect(() => parseSpec("a: true\na: true")).toThrow(/duplicate/);
    expect(() => parseSpec("a after b: true\nb: true")).toThrow(/not listed before/);
    expect(() => parseSpec("a after zz: true")).toThrow(/not listed before/);
  });
});

describe("start / wait / summary", () => {
  it("reports each task's output and status, and skips dependents of a failure", () => {
    const { run } = runner();
    expect(
      run(["start"], "bad: echo boom; exit 3\ndep after bad: echo never\nok: echo fine\n").status,
    ).toBe(0);

    const ok = run(["wait", "ok"]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("fine");

    const bad = run(["wait", "bad"]);
    expect(bad.status).toBe(3);
    expect(bad.stdout).toContain("boom");

    const dep = run(["wait", "dep"]);
    expect(dep.status).toBe(1);
    expect(dep.stdout).toContain("dep did not run because bad failed");
    expect(dep.stdout).not.toContain("never");

    expect(run(["wait", "ok", "bad", "dep"]).status).toBe(3);
    expect(run(["summary"]).stdout).toMatch(/dep\s.*skipped \(bad\)/);
  });

  it("starts a task only after its dependencies, and ready tasks in spec order", () => {
    const { dir, run } = runner("1");
    const order = path.join(dir, "order");
    run(
      ["start"],
      `first: sleep 0.2; echo first >> ${order}\n` +
        `second after first: echo second >> ${order}\n` +
        `third: echo third >> ${order}\n`,
    );
    expect(run(["wait", "first", "second", "third"]).status).toBe(0);
    expect(readFileSync(order, "utf8")).toBe("first\nsecond\nthird\n");
  });

  it("refuses to start a second run in the same directory, and to wait on an unknown id", () => {
    const { run } = runner();
    expect(run(["start"], "a: true\n").status).toBe(0);
    expect(run(["wait", "a"]).status).toBe(0);
    expect(run(["start"], "a: true\n").stderr).toContain("already holds a run");
    expect(run(["wait", "nope"]).stderr).toContain("no task nope");
  });
});
