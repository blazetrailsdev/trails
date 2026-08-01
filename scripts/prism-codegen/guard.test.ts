import { describe, it, expect } from "vitest";
import {
  diffBaseline,
  guardFailureMessage,
  parseBaseline,
  serializeBaseline,
  type ResidueRow,
} from "./guard.js";

const row = (name: string, status: ResidueRow["status"] = "divergent"): ResidueRow => ({
  rubyFile: "active_record/persistence.rb",
  name,
  status,
});

describe("prism-codegen convergence guard", () => {
  it("round-trips a baseline through its serialized row ids", () => {
    const rows = [row("save"), row("becomes", "missing")];
    expect(serializeBaseline(rows)).toBe(
      '[\n  "active_record/persistence.rb::becomes::missing",\n' +
        '  "active_record/persistence.rb::save::divergent"\n]\n',
    );
    expect(parseBaseline(serializeBaseline(rows))).toEqual([
      row("becomes", "missing"),
      row("save"),
    ]);
  });

  it("rejects a malformed row id rather than silently dropping the row", () => {
    expect(() => parseBaseline('["active_record/persistence.rb::save"]')).toThrow(/malformed/);
    expect(() => parseBaseline('["a::b::reordered"]')).toThrow(/malformed/);
  });

  it("fails on a residue row that is not in the baseline", () => {
    const diff = diffBaseline([row("save"), row("update")], [row("save")]);
    expect(diff.added).toEqual([row("update")]);
    expect(guardFailureMessage(diff)).toContain("persistence.rb :: update");
  });

  it("accepts a baseline that shrank", () => {
    const diff = diffBaseline([row("save")], [row("save"), row("update")]);
    expect(diff.removed).toEqual([row("update")]);
    expect(guardFailureMessage(diff)).toBeUndefined();
  });
});
