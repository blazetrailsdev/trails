/* eslint-disable vitest/no-conditional-expect, vitest/no-conditional-in-test */
import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { Application } from "../lib/application.js";
import { eachDirParent } from "../lib/file-list.js";
import { Rake } from "../lib/rake-module.js";
import { useApplicationTestCase } from "./support/application.js";

function alldirs(fn: string): string[] {
  const result: string[] = [];
  eachDirParent(fn, (d) => result.push(d));
  return result;
}

describe("TestRake", () => {
  const state = useApplicationTestCase();

  it("each dir parent", () => {
    expect(alldirs("a")).toEqual(["a"]);
    expect(alldirs("a/b")).toEqual(["a/b", "a"]);
    expect(alldirs("/a/b")).toEqual(["/a/b", "/a", "/"]);
    if (File.dirname("c:/foo") === "c:") {
      expect(alldirs("c:/a/b")).toEqual(["c:/a/b", "c:/a", "c:"]);
      expect(alldirs("c:a/b")).toEqual(["c:a/b", "c:a"]);
    } else {
      expect(alldirs("c:/a/b")).toEqual(["c:/a/b", "c:/a", "c:/"]);
      expect(alldirs("c:a/b")).toEqual(["c:a/b", "c:a"]);
    }
  });

  it("can override application", () => {
    const fakeApp = new Application();
    Rake.application = fakeApp;

    expect(Rake.application).toBe(fakeApp);
  });

  it("original dir reports current dir", () => {
    expect(Rake.originalDir()).toBe(state.tempdir);
  });
});
