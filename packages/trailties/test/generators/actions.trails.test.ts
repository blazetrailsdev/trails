import { describe, expect, it } from "vitest";
import { indentation, withIndentation } from "../../lib/generators/actions.js";

describe("Actions indentation", () => {
  it("withIndentation nests indentation and restores it after the block", async () => {
    const host = { _indentation: 0 };
    const seen: string[] = [];
    await withIndentation.call(host, async function () {
      seen.push(indentation.call(this));
      await withIndentation.call(this, function () {
        seen.push(indentation.call(this));
      });
      seen.push(indentation.call(this));
    });
    expect(seen).toEqual(["  ", "    ", "  "]);
    expect(indentation.call(host)).toBe("");
  });

  it("withIndentation restores indentation when the block raises", async () => {
    const host = { _indentation: 0 };
    await expect(
      withIndentation.call(host, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(host._indentation).toBe(0);
  });
});
