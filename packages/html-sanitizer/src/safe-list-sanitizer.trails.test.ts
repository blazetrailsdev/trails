import { describe, expect, test } from "vitest";
import { SafeListSanitizer } from "./safe-list-sanitizer.js";

describe("SafeListSanitizer scrub_node", () => {
  test("keeps a stripped node's children unless pruning", () => {
    const sanitizer = new SafeListSanitizer();

    expect(sanitizer.sanitize("a<script>x</script>c")).toBe("axc");
    expect(sanitizer.sanitize("a<style>b{}</style>c")).toBe("ab{}c");
    expect(sanitizer.sanitize("a<textarea>t</textarea>c")).toBe("atc");
    expect(sanitizer.sanitize("a<select><option>o</option></select>c")).toBe("aoc");
  });

  test("drops a stripped node's children when pruning", () => {
    expect(new SafeListSanitizer({ prune: true }).sanitize("<p>a<script>x</script>c</p>")).toBe(
      "<p>ac</p>",
    );
  });
});
