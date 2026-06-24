/**
 * Tests for the extractor output-schema token: it folds the declared per-method
 * field set AND the extractor source content into the ts-api cache key, so a new
 * output field (e.g. `calls`) busts stale entries without a manual version bump
 * — the PR #4020 regression. The token is stable for unchanged inputs (so the
 * cache actually hits) but changes when either input changes.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  extractorSchemaToken,
  EXTRACTOR_OUTPUT_FIELDS,
  EXTRACTOR_SOURCES,
  SCHEMA_VERSION_BASE,
} from "./extractor-schema.js";

const tmpDirs: string[] = [];
function mkDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extractor-schema-"));
  tmpDirs.push(dir);
  for (const src of EXTRACTOR_SOURCES) fs.writeFileSync(path.join(dir, src), `// ${src}\n`);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("extractorSchemaToken", () => {
  it("is prefixed with the base version", async () => {
    const token = await extractorSchemaToken(mkDir());
    expect(token.startsWith(`${SCHEMA_VERSION_BASE}-`)).toBe(true);
  });

  it("is stable across calls for identical inputs", async () => {
    const dir = mkDir();
    expect(await extractorSchemaToken(dir)).toBe(await extractorSchemaToken(dir));
  });

  it("changes when an extractor source's content changes", async () => {
    const dir = mkDir();
    const before = await extractorSchemaToken(dir);
    fs.writeFileSync(path.join(dir, EXTRACTOR_SOURCES[0]), "// edited output shape\n");
    expect(await extractorSchemaToken(dir)).not.toBe(before);
  });

  it("includes calls in the declared output field set (the #4020 regression)", () => {
    expect(EXTRACTOR_OUTPUT_FIELDS).toContain("calls");
  });

  it("tolerates a missing extractor source (best-effort hash)", async () => {
    const dir = mkDir();
    fs.rmSync(path.join(dir, EXTRACTOR_SOURCES[0]));
    expect(await extractorSchemaToken(dir)).toMatch(/^\d+-[0-9a-f]{12}$/);
  });
});
