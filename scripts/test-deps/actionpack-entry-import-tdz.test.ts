// Regression guard for the actionpack entry circular-init TDZ crash.
//
// `polymorphic-routes.ts` imported `RoutesProxy` as a value, and
// `routes-proxy.ts` imports `url-for.ts`, whose module-scope `UrlFor` Module
// does `mod.include(PolymorphicRoutes)` — reading every binding of
// `polymorphic-routes.ts` while it is still evaluating, crashing with
// `ReferenceError: Cannot access 'HelperMethodBuilder' before initialization`.
// `RoutesProxy` now resolves at call time through the `ActionDispatch::Routing`
// Autoload namespace (`packages/actionpack/src/namespaces.ts`, mirroring
// `action_dispatch/routing.rb:254`) — see CLAUDE.md, "Call-time constant
// resolution".
//
// A vitest import enters the funnel module first and masks the TDZ, so this
// imports the BUILT entry modules under plain node (the Unit Tests job runs
// `pnpm build` before vitest).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

function importUnderNode(entry: string): { status: number | null; stderr: string } {
  const res = spawnSync(process.execPath, ["-e", `await import(${JSON.stringify(entry)})`], {
    cwd: ROOT,
    encoding: "utf8",
    input: "",
  });
  return { status: res.status, stderr: res.stderr };
}

describe("actionpack entry circular-init", () => {
  it.each(["./packages/actionpack/dist/index.js", "./packages/trailties/dist/cli.js"])(
    "imports %s under plain node without a TDZ ReferenceError",
    (entry) => {
      const { status, stderr } = importUnderNode(entry);
      expect(stderr).not.toMatch(/before initialization/);
      expect(status).toBe(0);
    },
  );
});
