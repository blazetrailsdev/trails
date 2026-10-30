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
  it.each([
    "./packages/actionpack/dist/index.js",
    "./packages/actionpack/dist/system-testing.js",
    "./packages/trailties/dist/index.js",
    "./packages/trailties/dist/cli.js",
  ])(
    "imports %s under plain node without a TDZ ReferenceError",
    (entry) => {
      const { status, stderr } = importUnderNode(entry);
      expect(stderr).not.toMatch(/before initialization/);
      expect(status).toBe(0);
    },
    30_000,
  );

  it("loads neither playwright nor vite from a production boot under plain node", () => {
    const script = `
      import { registerHooks } from "node:module";
      const loaded = [];
      registerHooks({
        resolve(specifier, context, next) {
          const result = next(specifier, context);
          loaded.push(result.url);
          return result;
        },
      });
      await import("./packages/trailties/dist/index.js");
      await import("./packages/trailties/dist/all.js");
      const forbidden = loaded.filter((url) =>
        /\\/node_modules\\/(?:\\.pnpm\\/)?(?:playwright|vite|rollup|vitest)[@/]/.test(url),
      );
      console.log(JSON.stringify({ count: loaded.length, forbidden }));
    `;
    const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
      input: "",
    });
    expect(res.status, res.stderr).toBe(0);
    const { count, forbidden } = JSON.parse(res.stdout.trim().split("\n").at(-1)!);
    expect(count).toBeGreaterThan(100);
    expect(forbidden).toEqual([]);
  }, 30_000);
});
