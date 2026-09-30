import { describe, it, expect } from "vitest";
import { ArgumentError, File } from "@blazetrails/ruby-compat";
import { TestCase } from "../test-case.js";
import { assertRaises } from "./assertions.js";

describe("FileFixturesTest", () => {
  class FileFixturesTest extends TestCase {
    static {
      this.fileFixturePath = File.expandPath("../fixtures/file_fixtures", import.meta.dirname);
    }
  }
  const t = new FileFixturesTest("file_fixture");

  it("#file_fixture returns Pathname to file fixture", () => {
    const path = t.fileFixture("sample.txt");
    expect(Object(path)).toBeInstanceOf(String);
    expect(path).toMatch(/.*\/fixtures\/file_fixtures\/sample\.txt$/);
  });

  it("raises an exception when the fixture file does not exist", async () => {
    const e = await assertRaises([ArgumentError], {}, () => {
      t.fileFixture("nope");
    });
    expect(e.message).toMatch(
      /^the directory '[^']+fixtures\/file_fixtures' does not contain a file named 'nope'$/,
    );
  });
});

describe("FileFixturesPathnameDirectoryTest", () => {
  class FileFixturesPathnameDirectoryTest extends TestCase {
    static {
      this.fileFixturePath = File.expandPath("../fixtures/file_fixtures", import.meta.dirname);
    }
  }
  const t = new FileFixturesPathnameDirectoryTest("file_fixture_path");

  it("#file_fixture_path returns Pathname to file fixture", () => {
    const path = t.fileFixture("sample.txt");
    expect(Object(path)).toBeInstanceOf(String);
    expect(path).toMatch(/.*\/fixtures\/file_fixtures\/sample\.txt$/);
  });
});
