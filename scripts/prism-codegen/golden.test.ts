import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import { countParseErrors } from "./index.js";
import { generateTarget, snapshotPathFor, outNameFor, vendoredRailsPresent } from "./golden.js";
import { TARGET_FILES } from "./files.js";

// Regenerating reads the vendored Rails checkout, which only the
// rails-comparison CI job fetches (unit-tests runs the rest of this directory
// without vendor/). Locally `pnpm codegen:snapshot` fetches it first.
const vendored = await vendoredRailsPresent();

describe.skipIf(!vendored)("prism-codegen golden output", () => {
  for (const f of TARGET_FILES) {
    const outName = outNameFor(f);

    it(`emits the checked-in image for ${f.ruby}`, async () => {
      const { code } = await generateTarget(f);
      // toMatchFileSnapshot resolves relative to this test file; the golden
      // paths elsewhere are repo-relative, so strip the directory prefix.
      await expect(code).toMatchFileSnapshot(
        "./" + snapshotPathFor(outName).replace("scripts/prism-codegen/", ""),
      );
    });

    it(`has zero parse errors in the checked-in image for ${f.ruby}`, async () => {
      const snapshot = await fs.readFile(snapshotPathFor(outName), "utf8");
      expect(countParseErrors(snapshot)).toBe(0);
    });
  }
});
