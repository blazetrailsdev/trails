import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// sync.ts runs main() on import, so these guards read the source rather than
// importing it.
const dir = fileURLToPath(new URL(".", import.meta.url));
let source: string;

beforeAll(async () => {
  source = await readFile(`${dir}sync.ts`, "utf8");
});

describe("sync-stats job log fetch", () => {
  it("passes --allow-escape-sequences when fetching job logs", () => {
    expect(source).toMatch(
      /gh\(\s*`api --allow-escape-sequences repos\/\$\{REPO\}\/actions\/jobs\/\$\{jobId\}\/logs`\s*\)/,
    );
  });

  it("fails the run when jobs were selected but no logs were fetched", () => {
    expect(source).toMatch(/if \(fetched === 0\) \{\s*throw new JobLogFetchFailedError\(/);
    expect(source).toMatch(/class JobLogFetchFailedError extends Error/);
  });

  it("does not swallow the fetch failure as a rate-limit stop", () => {
    expect(source).toMatch(
      /if \(err instanceof RateLimitExhaustedError\) \{.*?\} else \{\s*throw err;/s,
    );
  });
});
