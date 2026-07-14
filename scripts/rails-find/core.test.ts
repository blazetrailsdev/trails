import { mkdtemp, mkdir, writeFile, rm, utimes } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_MANIFEST,
  LOCKFILE,
  TEST_MANIFEST,
  findMethods,
  findTests,
  grepVendor,
  railsFind,
} from "./core.js";

const TEST_MANIFEST_FIXTURE = {
  packages: {
    activerecord: {
      files: [
        {
          file: "active_record_schema_test.rb",
          testCases: [
            {
              path: "ActiveRecordSchemaTest > has primary key",
              description: "has primary key",
              file: "active_record_schema_test.rb",
              line: 25,
            },
          ],
        },
      ],
    },
  },
};

const API_MANIFEST_FIXTURE = {
  packages: {
    activerecord: {
      classes: {
        "ActiveRecord::Base": {
          instanceMethods: [{ name: "save", file: "persistence.rb", line: 60 }],
          classMethods: [{ name: "find_by", file: "querying.rb", line: 80 }],
        },
      },
      modules: {},
      fileConstants: {
        "version.rb": { VERSION: { kind: "expr" } },
      },
    },
  },
};

describe("findTests", () => {
  it("matches a description substring or synthesized test_ name → vendor file:line", () => {
    const [r] = findTests(TEST_MANIFEST_FIXTURE as never, "primary key");
    expect(r).toMatchObject({
      mode: "test",
      file: "vendor/rails/activerecord/test/cases/active_record_schema_test.rb",
      line: 25,
    });
    expect(findTests(TEST_MANIFEST_FIXTURE as never, "test_has_primary_key")).toHaveLength(1);
  });

  it("synthesizes the Rails method name preserving punctuation (gsub(/\\s+/) only)", () => {
    const tc = { path: "T > x", description: "doesn't raise when a != b", file: "t.rb", line: 7 };
    const fixture = { packages: { activerecord: { files: [{ file: "t.rb", testCases: [tc] }] } } };
    // Rails method: test_doesn't_raise_when_a_!=_b — punctuation survives, only
    // whitespace runs collapse. A sanitizing regex would drop `'`/`!=` and miss.
    const [r] = findTests(fixture as never, "test_doesn't_raise_when_a_!=_b");
    expect(r).toMatchObject({ mode: "test", line: 7, exact: true });
  });
});

describe("findMethods", () => {
  it("resolves instance/class methods and file constants to lib file:line", () => {
    const [inst] = findMethods(API_MANIFEST_FIXTURE as never, "save");
    expect(inst).toMatchObject({
      mode: "method",
      file: "vendor/rails/activerecord/lib/active_record/persistence.rb",
      line: 60,
      label: "ActiveRecord::Base#save", // # for instance
    });
    expect(findMethods(API_MANIFEST_FIXTURE as never, "find_by")[0].label).toBe(
      "ActiveRecord::Base.find_by", // . for class method
    );
    expect(findMethods(API_MANIFEST_FIXTURE as never, "VERSION")[0]).toMatchObject({
      mode: "constant",
      label: "VERSION",
    });
  });
});

async function writeManifests(root: string, test: unknown, api: unknown): Promise<void> {
  await mkdir(path.join(root, path.dirname(TEST_MANIFEST)), { recursive: true });
  await mkdir(path.join(root, path.dirname(API_MANIFEST)), { recursive: true });
  await writeFile(path.join(root, TEST_MANIFEST), JSON.stringify(test));
  await writeFile(path.join(root, API_MANIFEST), JSON.stringify(api));
}

describe("grepVendor + railsFind fallback", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "rails-find-"));
    const arDir = path.join(root, "vendor/rails/activerecord/lib/active_record");
    await mkdir(arDir, { recursive: true });
    await writeFile(
      path.join(arDir, "sample.rb"),
      "class Sample\n  def unique_marker_token\n  end\nend\n",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("greps vendored .rb files and reports file:line relative to root", async () => {
    const results = await grepVendor(root, "unique_marker_token");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      mode: "grep",
      file: "vendor/rails/activerecord/lib/active_record/sample.rb",
      line: 2,
    });
  });

  it("railsFind falls back to grep when no manifest matches", async () => {
    const { results, modes } = await railsFind(root, "unique_marker_token");
    expect(modes).toEqual(["grep"]);
    expect(results).toHaveLength(1);
  });

  it("railsFind prefers index hits over grep when manifests are present", async () => {
    await writeManifests(root, TEST_MANIFEST_FIXTURE, API_MANIFEST_FIXTURE);
    const { modes } = await railsFind(root, "save");
    expect(modes).toEqual(["method"]);
  });

  it("flags a used manifest older than the vendor lockfile as stale", async () => {
    await writeManifests(root, TEST_MANIFEST_FIXTURE, API_MANIFEST_FIXTURE);
    // Lockfile newer than the manifests → the used api manifest is stale.
    await writeFile(path.join(root, LOCKFILE), "{}");
    const future = new Date(Date.now() + 60_000);
    await utimes(path.join(root, LOCKFILE), future, future);
    const { stale } = await railsFind(root, "save");
    expect(stale).toEqual([API_MANIFEST]);
    // Fresh manifests (lockfile older) → nothing flagged.
    const old = new Date(Date.now() - 60_000);
    await utimes(path.join(root, LOCKFILE), old, old);
    expect((await railsFind(root, "save")).stale).toEqual([]);
  });

  it("drops substring noise when an exact hit exists, restored by --all", async () => {
    // `primary_key` is an exact method name but only a substring of the test
    // description "has primary key" (→ test_has_primary_key).
    const api = {
      packages: {
        activerecord: {
          classes: {
            "ActiveRecord::Base": {
              instanceMethods: [{ name: "primary_key", file: "core.rb", line: 5 }],
              classMethods: [],
            },
          },
          modules: {},
        },
      },
    };
    await writeManifests(root, TEST_MANIFEST_FIXTURE, api);

    const { results, exactOnly, suppressed } = await railsFind(root, "primary_key");
    expect(exactOnly).toBe(true);
    expect(suppressed).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ mode: "method", exact: true });

    const withAll = await railsFind(root, "primary_key", { all: true });
    expect(withAll.exactOnly).toBe(false);
    expect(withAll.results).toHaveLength(2);
  });
});
