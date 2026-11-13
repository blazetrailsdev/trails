import { describe, expect, it } from "vitest";

import { check, expectedMirrors } from "./vendor-mirrors.js";

describe("package.json mirrors fields", () => {
  it("match vendor/sources.lock.json (run `pnpm vendor:mirrors` after a ref bump)", async () => {
    const { errors } = await check();
    expect(errors).toEqual([]);
  });

  it("are absent exactly where no upstream source maps to the package", async () => {
    const { noUpstream } = await check();
    expect(noUpstream).toEqual(
      expect.arrayContaining(["trails-tsc", "vitest-matchers", "website"]),
    );
    const expected = await expectedMirrors();
    for (const dir of noUpstream) expect(expected.get(dir)).toBeNull();
  });

  it("lists every source of a package built from several", async () => {
    const expected = await expectedMirrors();
    expect(expected.get("activerecord")?.map((m) => m.source)).toEqual(
      expect.arrayContaining(["rails", "pg", "mysql2", "sqlite3"]),
    );
    for (const mirrors of expected.values())
      for (const m of mirrors ?? []) expect(m.sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
