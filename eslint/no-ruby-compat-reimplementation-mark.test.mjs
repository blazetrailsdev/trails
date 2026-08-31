import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";

import {
  MARK_PATH,
  checkMark,
  isSorted,
  readCommitted,
  tighten,
} from "./no-ruby-compat-reimplementation-mark.mjs";

const ROWS = [
  "packages/a/src/one.ts::fetch",
  "packages/b/src/two.ts::cmp",
  "packages/c/src/three.ts::rational",
];

describe("no-ruby-compat-reimplementation mark", () => {
  it("passes at the mark", () => {
    expect(checkMark(ROWS, 3)).toEqual({ errors: [], tightenedMark: null });
  });

  it("fails one row over the mark", () => {
    const { errors } = checkMark([...ROWS, "packages/d/src/four.ts::spaceship"], 3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ONLY-SHRINK");
  });

  it("fails an out-of-order row", () => {
    const appended = [ROWS[0], ROWS[2], ROWS[1]];
    expect(isSorted(appended)).toBe(false);
    const { errors } = checkMark(appended, 3);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("not sorted");
  });

  it("passes under the mark, and the tighten path narrows it", async () => {
    expect(checkMark(ROWS.slice(0, 2), 3)).toEqual({ errors: [], tightenedMark: 2 });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-mark-"));
    const markPath = path.join(dir, "mark.json");
    await fs.writeFile(markPath, `${JSON.stringify({ rows: 3 }, null, 2)}\n`);
    expect(await tighten(2, markPath)).toBe(2);
    expect(JSON.parse(await fs.readFile(markPath, "utf8"))).toEqual({ rows: 2 });
    // Only-shrink: there is no path that writes the mark up.
    expect(await tighten(9, markPath)).toBe(2);
    expect(JSON.parse(await fs.readFile(markPath, "utf8"))).toEqual({ rows: 2 });
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("the committed register", () => {
  it("is at or under its mark and sorted", async () => {
    const { rows, mark } = await readCommitted();
    const { errors, tightenedMark } = checkMark(rows, mark);
    expect(errors).toEqual([]);
    // A move story that deleted rows leaves the mark above the measurement;
    // narrow it here, the way the call-set gate auto-tightens a shard the
    // branch already rewrote, and COMMIT the rewritten mark.
    if (tightenedMark !== null) await tighten(tightenedMark);
    expect(JSON.parse(await fs.readFile(MARK_PATH, "utf8")).rows).toBe(rows.length);
  });
});
