import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import { countParseErrors } from "./index.js";
import {
  generateTarget,
  outNameFor,
  snapshotPathFor,
  snapshotRelPathFor,
  vendoredRailsPresent,
} from "./golden.js";
import { TARGET_FILES } from "./files.js";

const vendored = await vendoredRailsPresent();

describe.skipIf(!vendored)("prism-codegen golden output", () => {
  for (const f of TARGET_FILES) {
    const outName = outNameFor(f);

    it(`emits the checked-in image for ${f.ruby}`, async () => {
      const { code } = await generateTarget(f);
      await expect(code).toMatchFileSnapshot(snapshotRelPathFor(outName));
    });

    it(`has zero parse errors in the checked-in image for ${f.ruby}`, async () => {
      const snapshot = await fs.readFile(snapshotPathFor(outName), "utf8");
      expect(countParseErrors(snapshot)).toBe(0);
    });
  }
});
