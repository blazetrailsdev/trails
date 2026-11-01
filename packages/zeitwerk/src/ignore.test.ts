import { Dir, File } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "./loader.js";
import { newLoader, teardown } from "./test-helpers/loader-test.js";

describe("TestIgnore", () => {
  let loader: Loader;
  const thisDir = Dir.pwd();
  const thisFile = File.expandPath("package.json", thisDir);
  const ascendant = File.expandPath(`${thisDir}/../..`);

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  it.skip("ignored root directories are ignored", () => {});
  it.skip("ignored root directories are ignored, but nested ones are not", () => {});
  it.skip("ignored files are ignored", () => {});
  it.skip("ignored directories are ignored", () => {});
  it.skip("ignored files are not eager loaded", () => {});
  it.skip("ignored directories are not eager loaded", () => {});
  it.skip("supports glob patterns", () => {});
  it.skip("ignored paths are recomputed on reload", () => {});

  it("supports several arguments", async () => {
    const a = `${Dir.pwd()}/a.rb`;
    const b = `${Dir.pwd()}/b.rb`;
    await loader.ignore(a, b);
    expect(loader.ignoredGlobPatterns).toEqual(new Set([a, b]));
  });

  it("supports an array", async () => {
    const a = `${Dir.pwd()}/a.rb`;
    const b = `${Dir.pwd()}/b.rb`;
    await loader.ignore([a, b]);
    expect(loader.ignoredGlobPatterns).toEqual(new Set([a, b]));
  });

  it("returns true if a directory is ignored as is", async () => {
    await loader.ignore(thisDir);
    expect(loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns true if a file is ignored as is", async () => {
    await loader.ignore(thisFile);
    expect(loader.isIgnores(thisFile)).toBeTruthy();
  });

  it("returns true for a descendant of an ignored directory", async () => {
    await loader.ignore(ascendant);
    expect(loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns true for a file in a descendant of an ignored directory", async () => {
    await loader.ignore(ascendant);
    expect(loader.isIgnores(thisFile)).toBeTruthy();
  });

  it("returns false for the directory of an ignored file", async () => {
    await loader.ignore(thisFile);
    expect(!loader.isIgnores(thisDir)).toBeTruthy();
  });

  it("returns false for an ascendant directory of an ignored directory", async () => {
    await loader.ignore(thisDir);
    expect(!loader.isIgnores(ascendant)).toBeTruthy();
  });

  it("returns false if nothing is ignored", () => {
    expect(!loader.isIgnores(thisDir)).toBeTruthy();
    expect(!loader.isIgnores(thisFile)).toBeTruthy();
  });
});
