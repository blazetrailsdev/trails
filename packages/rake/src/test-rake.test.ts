import { describe, expect, it } from "vitest";
import { Application } from "./application.js";
import { Rake, eachDirParent } from "./rake-module.js";
import { useApplicationTestCase } from "./test-helpers/application.js";

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
    expect(alldirs("c:/a/b")).toEqual(["c:/a/b", "c:/a", "c:"]);
    expect(alldirs("c:a/b")).toEqual(["c:a/b", "c:a"]);
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
