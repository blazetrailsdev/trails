import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  findEmptyBaselines,
  findNonCanonicalBaselines,
  reportNonCanonicalBaselines,
  serializeBaseline,
} from "./baseline-json.js";

describe("serializeBaseline", () => {
  const entry = { reason: "Converged (RFC 0032) \u2014 no include? call exists to match." };

  it("writes non-ASCII literally rather than as \\uXXXX escapes", () => {
    const out = serializeBaseline([entry]);
    expect(out).toContain("\u2014");
    expect(out).not.toContain("\\u2014");
  });

  it("round-trips its own output byte-for-byte", () => {
    const once = serializeBaseline([entry]);
    expect(serializeBaseline(JSON.parse(once))).toBe(once);
  });

  it("indents with two spaces and ends in a newline", () => {
    expect(serializeBaseline([entry])).toMatch(/^\[\n {2}\{\n {4}"reason"/);
    expect(serializeBaseline([entry]).endsWith("\n")).toBe(true);
  });
});

describe("findNonCanonicalBaselines", () => {
  const entry = { reason: "an em-dash \u2014 in prose" };

  async function withFiles<T>(
    files: Record<string, string>,
    fn: (dir: string, paths: string[]) => Promise<T>,
  ): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-baseline-"));
    const paths: string[] = [];
    for (const [name, text] of Object.entries(files)) {
      const p = path.join(dir, name);
      await fs.writeFile(p, text);
      paths.push(p);
    }
    try {
      return await fn(dir, paths);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("passes a file already written in canonical form", async () => {
    await withFiles({ "a.json": serializeBaseline([entry]) }, async (_dir, paths) => {
      expect(await findNonCanonicalBaselines(paths)).toEqual([]);
    });
  });

  it("flags a file whose non-ASCII is escaped (the churn trap)", async () => {
    // Semantically identical to the canonical form — only the bytes differ, so
    // every `--write` would silently rewrite it.
    const escaped = JSON.stringify([entry], null, 2).replace("\u2014", "\\u2014") + "\n";
    await withFiles({ "a.json": escaped }, async (_dir, paths) => {
      expect(JSON.parse(escaped)).toEqual([entry]);
      expect(await findNonCanonicalBaselines(paths)).toEqual(paths);
    });
  });

  it("flags a file missing its trailing newline", async () => {
    const raw = JSON.stringify([entry], null, 2);
    await withFiles({ "a.json": raw }, async (_dir, paths) => {
      expect(await findNonCanonicalBaselines(paths)).toEqual(paths);
    });
  });
});

describe("findEmptyBaselines", () => {
  async function withFile<T>(text: string, fn: (file: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-baseline-"));
    const file = path.join(dir, "a.json");
    await fs.writeFile(file, text);
    try {
      return await fn(file);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("flags a shard holding no rows", async () => {
    await withFile(serializeBaseline([]), async (file) => {
      expect(await findEmptyBaselines([file])).toEqual([file]);
    });
  });

  it("passes a shard holding a row", async () => {
    await withFile(serializeBaseline([{ reason: "plain" }]), async (file) => {
      expect(await findEmptyBaselines([file])).toEqual([]);
    });
  });
});

describe("reportNonCanonicalBaselines", () => {
  it("reports nothing for canonical files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-report-"));
    const file = path.join(dir, "a.json");
    await fs.writeFile(file, serializeBaseline([{ reason: "plain" }]));
    try {
      expect(await reportNonCanonicalBaselines([file], "gate")).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// The gate arm above only runs where a compare artifact exists; this keeps the
// committed baselines honest in any plain `vitest` run.
describe("committed api-compare baselines", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));

  async function jsonFilesUnder(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) out.push(...(await jsonFilesUnder(full)));
      else if (d.name.endsWith(".json")) out.push(full);
    }
    return out;
  }

  it("are all written in canonical form", async () => {
    const files = [
      ...(await jsonFilesUnder(path.join(HERE, "call-mismatches-exclude"))),
      path.join(HERE, "body-pins.json"),
      path.join(HERE, "arity-exclude.json"),
      ...(await jsonFilesUnder(path.join(HERE, "call-mismatches-unreviewed"))),
    ];
    expect(await findNonCanonicalBaselines(files)).toEqual([]);
  });

  // An empty shard is deleted by every reseed, so committing one makes the
  // mandatory reseed-drift check report a diff its caller did not cause.
  it("hold no empty shards", async () => {
    const files = [
      ...(await jsonFilesUnder(path.join(HERE, "call-mismatches-exclude"))),
      ...(await jsonFilesUnder(path.join(HERE, "call-mismatches-unreviewed"))),
    ];
    expect(await findEmptyBaselines(files)).toEqual([]);
  });
});
