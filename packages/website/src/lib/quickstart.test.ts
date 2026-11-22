import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./parity.js";
import {
  LANDING_BLOCKS,
  LANDING_STEPS,
  landingHero,
  quickstartBlock,
  quickstartBlocks,
} from "./quickstart.js";

describe("landing page", () => {
  it("reads every landing block from a README Quickstart block", async () => {
    const blocks = await quickstartBlocks();
    for (const spec of [...LANDING_BLOCKS, ...LANDING_STEPS]) {
      expect(blocks).toContain(quickstartBlock(blocks, spec.region, spec.prefix));
    }
    const hero = landingHero(blocks);
    expect(blocks).toContain(hero.file);
    expect(hero.file.code.split("\n")[hero.line - 1]).toContain("const n");
  });

  it("follows an edit to the Quickstart", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "website-quickstart-"));
    try {
      const readme = await fs.readFile(path.join(REPO_ROOT, "README.md"), "utf8");
      await fs.writeFile(
        path.join(root, "README.md"),
        readme.replace("export class Post extends", "export class Article extends"),
      );
      const block = quickstartBlock(
        await quickstartBlocks(root),
        "quickstart-query",
        "// app/models/post.ts",
      );
      expect(block.code).toContain("export class Article extends");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
