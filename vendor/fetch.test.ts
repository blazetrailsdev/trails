import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { fetchCandidate, fetchSource, parseArgs, pruneSource } from "./fetch.js";
import {
  libEntryFilesManifest,
  libPathsManifest,
  SOURCES,
  testPathsManifest,
  type UpstreamSource,
  vendoredRoot,
} from "./sources.js";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** A local upstream with tags `v1.0.0` and `v2.0.0`, standing in for a gem repo. */
async function makeUpstream(root: string): Promise<string> {
  const upstream = join(root, "upstream");
  await mkdir(join(upstream, "lib"), { recursive: true });
  await git(["init", "-q", "-b", "main"], upstream);
  for (const tag of ["v1.0.0", "v2.0.0"]) {
    await writeFile(join(upstream, "lib", "version.rb"), `VERSION = "${tag}"\n`);
    await git(["add", "."], upstream);
    await git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", tag], upstream);
    await git(["tag", tag], upstream);
  }
  return upstream;
}

function fakeSource(url: string, ref: string): UpstreamSource {
  return {
    name: "fake",
    origin: { type: "git", url, ref },
    packages: [{ name: "fake", libPath: "lib" }],
  };
}

describe("vendor/fetch.ts parseArgs", () => {
  it("defaults: no flags", () => {
    expect(parseArgs([])).toEqual({
      refresh: false,
      prune: false,
      printPaths: { active: false },
      printTestPaths: false,
      printLibPaths: false,
      printLibEntryFiles: false,
    });
  });

  it("--refresh sets the flag", () => {
    expect(parseArgs(["--refresh"]).refresh).toBe(true);
  });

  it("--source <name>", () => {
    expect(parseArgs(["--source", "rails"]).sourceFilter).toBe("rails");
  });

  it("--print-paths with no arg = all sources", () => {
    expect(parseArgs(["--print-paths"]).printPaths).toEqual({ active: true, name: undefined });
  });

  it("--print-paths <name> = filtered", () => {
    expect(parseArgs(["--print-paths", "rails"]).printPaths).toEqual({
      active: true,
      name: "rails",
    });
  });

  it("--print-paths followed by another flag treats next as flag, not name", () => {
    // Regression: a bare --print-paths in the middle of an arg list shouldn't
    // greedily consume the next flag as its argument.
    const a = parseArgs(["--print-paths", "--source", "rails"]);
    expect(a.printPaths).toEqual({ active: true, name: undefined });
    expect(a.sourceFilter).toBe("rails");
  });

  it("--print-test-paths sets the flag", () => {
    expect(parseArgs(["--print-test-paths"]).printTestPaths).toBe(true);
  });

  it("--print-lib-paths sets the flag", () => {
    expect(parseArgs(["--print-lib-paths"]).printLibPaths).toBe(true);
  });

  it("--print-test-paths emits valid JSON matching testPathsManifest()", async () => {
    // Spawn the CLI for real (not just parseArgs) so the integration that
    // ruby relies on — `TEST_PATHS_JSON=$(pnpm --silent vendor:fetch --print-test-paths)`
    // — gets exercised end-to-end. Catches regressions in stdout shape that
    // unit-testing the parser alone would miss (extra log lines, banner output,
    // newline trimming bugs, etc.).
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const out = execFileSync(
      "pnpm",
      ["--silent", "tsx", join(here, "fetch.ts"), "--print-test-paths"],
      {
        encoding: "utf8",
      },
    );
    const { testPathsManifest } = await import("./sources.js");
    expect(JSON.parse(out)).toEqual(testPathsManifest());
  });

  it("--print-lib-paths emits valid JSON matching libPathsManifest()", async () => {
    // Mirror of the --print-test-paths integration test for wave-6's
    // LIB_PATHS_JSON pipeline (extract-ruby-api.rb).
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const out = execFileSync(
      "pnpm",
      ["--silent", "tsx", join(here, "fetch.ts"), "--print-lib-paths"],
      {
        encoding: "utf8",
      },
    );
    const { libPathsManifest } = await import("./sources.js");
    expect(JSON.parse(out)).toEqual(libPathsManifest());
  });

  it("--print-lib-entry-files emits valid JSON matching libEntryFilesManifest()", async () => {
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const out = execFileSync(
      "pnpm",
      ["--silent", "tsx", join(here, "fetch.ts"), "--print-lib-entry-files"],
      { encoding: "utf8" },
    );
    const { libEntryFilesManifest } = await import("./sources.js");
    expect(JSON.parse(out)).toEqual(libEntryFilesManifest());
  });

  it("--ref <ref> needs --source", () => {
    expect(parseArgs(["--source", "rails", "--ref", "v8.1.0"]).ref).toBe("v8.1.0");
    expect(() => parseArgs(["--ref", "v8.1.0"])).toThrow(/--ref needs --source/);
  });

  it("--prune sets the flag and refuses --ref", () => {
    expect(parseArgs(["--prune"]).prune).toBe(true);
    expect(() => parseArgs(["--source", "rails", "--ref", "v8.1.0", "--prune"])).toThrow(
      /cannot be combined/,
    );
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown flag: --bogus/);
  });
});

describe("vendor/fetch.ts version directories", () => {
  it("--ref clones a candidate beside the active version without touching the lockfile", async () => {
    const root = await mkdtemp(join(tmpdir(), "vendor-fetch-"));
    try {
      const upstream = await makeUpstream(root);
      const versionsDir = join(root, "vendor", "fake");
      const source = fakeSource(upstream, "v1.0.0");
      await fetchSource(source, { refresh: false, dest: join(versionsDir, "v1.0.0") });
      const lockBefore = await readFile(join(here, "sources.lock.json"), "utf8");

      const dest = await fetchCandidate(source, "v2.0.0", { refresh: false, versionsDir });
      expect(dest).toBe(join(versionsDir, "v2.0.0"));
      expect(await readFile(join(dest, "lib", "version.rb"), "utf8")).toContain("v2.0.0");
      expect(await readFile(join(versionsDir, "v1.0.0", "lib", "version.rb"), "utf8")).toContain(
        "v1.0.0",
      );

      // --refresh re-clones the candidate only; the active version survives.
      await writeFile(join(versionsDir, "v1.0.0", "marker"), "");
      await fetchCandidate(source, "v2.0.0", { refresh: true, versionsDir });
      expect((await readdir(versionsDir)).sort()).toEqual(["v1.0.0", "v2.0.0"]);
      await stat(join(versionsDir, "v1.0.0", "marker"));

      expect(await readFile(join(here, "sources.lock.json"), "utf8")).toBe(lockBefore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("the HEAD-vs-lockfile abort still fires for the active version", async () => {
    const root = await mkdtemp(join(tmpdir(), "vendor-fetch-"));
    try {
      const upstream = await makeUpstream(root);
      const dest = join(root, "vendor", "fake", "v1.0.0");
      const source = fakeSource(upstream, "v1.0.0");
      const entry = await fetchSource(source, { refresh: false, dest });
      await expect(
        fetchSource(source, {
          refresh: false,
          dest,
          lockEntry: { ref: entry.ref, sha: "0".repeat(40) },
        }),
      ).rejects.toThrow(/does not match lockfile/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--prune removes every inactive version directory and is then a no-op", async () => {
    const root = await mkdtemp(join(tmpdir(), "vendor-fetch-"));
    try {
      const source = fakeSource("unused", "v3_3_11");
      for (const dir of ["v3.3.11", "v3.4.10", "v3.3.12"]) {
        await mkdir(join(root, dir, "lib"), { recursive: true });
      }
      const removed = await pruneSource(source, root);
      expect(removed.sort()).toEqual([join(root, "v3.3.12"), join(root, "v3.4.10")]);
      expect(await readdir(root)).toEqual(["v3.3.11"]);
      expect(await pruneSource(source, root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--print-* answer the active version only while a candidate is on disk", async () => {
    const source = SOURCES.find((s) => s.name === "rails")!;
    const versionsDir = dirname(vendoredRoot(source.name));
    const candidate = join(versionsDir, "v0.0.0-candidate-fetch-test");
    const hadVersionsDir = await stat(versionsDir).then(
      () => true,
      () => false,
    );
    await mkdir(join(candidate, "activerecord", "lib", "active_record"), { recursive: true });
    try {
      const run = async (flag: string) => {
        const { stdout } = await execFileAsync("pnpm", [
          "--silent",
          "tsx",
          join(here, "fetch.ts"),
          flag,
        ]);
        expect(stdout).not.toContain("candidate-fetch-test");
        return stdout;
      };
      const [paths, lib, test, entry] = await Promise.all([
        run("--print-paths"),
        run("--print-lib-paths"),
        run("--print-test-paths"),
        run("--print-lib-entry-files"),
      ]);
      expect(paths.trim().split("\n")).toEqual(SOURCES.map((s) => vendoredRoot(s.name)));
      expect(JSON.parse(lib)).toEqual(libPathsManifest());
      expect(JSON.parse(test)).toEqual(testPathsManifest());
      expect(JSON.parse(entry)).toEqual(libEntryFilesManifest());
    } finally {
      await rm(hadVersionsDir ? candidate : versionsDir, { recursive: true, force: true });
    }
  });
});
