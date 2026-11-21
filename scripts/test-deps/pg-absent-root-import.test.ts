import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const DIR = join(import.meta.dirname, "pg-absent");

function runSmoke(withHook: boolean): { stdout: string; stderr: string; status: number | null } {
  const args = withHook ? ["--import", join(DIR, "hook.mjs")] : [];
  return spawnSync(process.execPath, [...args, join(DIR, "smoke.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
    input: "",
  });
}

function result(withHook: boolean): Record<string, unknown> {
  const res = runSmoke(withHook);
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout.trim().split("\n").at(-1)!) as Record<string, unknown>;
}

describe("pg-free install", () => {
  it("imports the built activerecord root with pg and @blazetrails/pg unresolvable, and resolve raises LoadError", () => {
    expect(result(true)).toEqual({
      imported: true,
      resolved: {
        error: "LoadError",
        message: expect.stringMatching(
          /^Error loading the 'postgresql' Active Record adapter\. Missing a package it depends on\? Cannot find package '@blazetrails\/pg'/,
        ),
      },
    });
  }, 60_000);

  it("resolves the postgresql adapter when @blazetrails/pg resolves, so the hook is what made it fail", () => {
    expect(result(false)).toEqual({ imported: true, resolved: { value: "PostgreSQLAdapter" } });
  }, 60_000);
});
