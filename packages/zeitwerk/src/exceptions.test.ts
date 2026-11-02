import { File } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NameError } from "./error.js";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

describe("TestExceptions", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  const failure = (fn: () => unknown) =>
    Promise.resolve()
      .then(fn)
      .catch((e: unknown) => e) as Promise<NameError>;

  function assertErrorMessage(message: string, error: Error) {
    expect(error.message.split("\n")[0]).toEqual(message);
  }

  const withInflection = (files: [string, string][]) => {
    loader.inflector.inflect({ foo_bar: "Foo-bar" });
    return withSetup(loader, files, {}, () => null);
  };

  it("raises NameError if the expected constant is not defined", async () => {
    await withSetup(loader, [["typo.ts", "export const TyPo = 1"]], {}, async () => {
      const error = await failure(() => get(Object, "Typo"));
      expect(() => {
        throw error;
      }).toThrow(NameError);
      assertErrorMessage(
        `expected file ${File.expandPath("typo.ts")} to define constant Typo, but didn't`,
        error,
      );
      expect(error.constantName).toEqual("Typo");
    });
  });

  it("eager loading raises NameError if files do not define the expected constants", async () => {
    await withSetup(loader, [["x.ts", ""]], {}, async () => {
      const error = await failure(() => loader.eagerLoad());
      expect(() => {
        throw error;
      }).toThrow(NameError);
      assertErrorMessage(
        `expected file ${File.expandPath("x.ts")} to define constant X, but didn't`,
        error,
      );
      expect(error.constantName).toEqual("X");
    });
  });

  // PERMANENT-SKIP: a file defines its constant by export, which the loader seats on the namespace it expects, so it cannot define `CLI::X` beside `Cli` (RFC 0213).
  it.skip("eager loading raises NameError if a namespace has not been loaded yet", () => {});

  it("raises if the file does", async () => {
    const files: [string, string][] = [["raises.ts", 'throw new RangeError("foo")']];
    await withSetup(loader, files, {}, async () => {
      await expect(get(Object, "Raises")).rejects.toThrow("foo");
    });
  });

  it("raises Zeitwerk::NameError if the inflector returns an invalid constant name for a file", async () => {
    const error = await failure(() => withInflection([["foo-bar.ts", ""]]));
    expect(() => {
      throw error;
    }).toThrow(NameError);
    expect(error.constantName).toEqual("Foo-bar");
    expect(error.message).toContain("wrong constant name Foo-bar");
    expect(error.message).toContain("Tell Zeitwerk to ignore this particular file.");
  });

  it("raises Zeitwerk::NameError if the inflector returns an invalid constant name for a directory", async () => {
    const error = await failure(() => withInflection([["foo-bar/baz.ts", ""]]));
    expect(() => {
      throw error;
    }).toThrow(NameError);
    expect(error.constantName).toEqual("Foo-bar");
    expect(error.message).toContain("wrong constant name Foo-bar");
    expect(error.message).toContain("Tell Zeitwerk to ignore this particular directory.");
  });
});
