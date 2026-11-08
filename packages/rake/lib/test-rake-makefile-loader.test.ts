import { File } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "./rake.js";
import { MakefileLoader } from "./loaders/makefile.js";
import { Rake } from "./rake-module.js";
import { useApplicationTestCase } from "./test-helpers/application.js";

const SAMPLE_MF = String.raw`# Comments
a: a1 a2 a3 a4
b: b1 b2 b3 \
   b4 b5 b6\
# Mid: Comment
b7

 a : a5 a6 a7
c: c1
d: d1 d2 \

e f : e1 f1

g\ 0: g1 g\ 2 g\ 3 g4
`;

describe("TestRakeMakefileLoader", () => {
  useApplicationTestCase();

  it("parse", async () => {
    await File.writeAsync("sample.mf", SAMPLE_MF);

    const app = Rake.application!;
    app.clear();
    const loader = new MakefileLoader();
    await loader.load("sample.mf");
    for (const t of ["a", "b", "c", "d"]) {
      expect(app.lookup(t), `${t} should be a defined task`).toBeTruthy();
    }
    const prerequisites = (name: string) => [...app.lookup(name)!.prerequisites].sort();
    expect(prerequisites("a")).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    expect(prerequisites("b")).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
    expect(prerequisites("c")).toEqual(["c1"]);
    expect(prerequisites("d")).toEqual(["d1", "d2"]);
    expect(prerequisites("e")).toEqual(["e1", "f1"]);
    expect(prerequisites("f")).toEqual(["e1", "f1"]);
    expect(prerequisites("g 0")).toEqual(["g 2", "g 3", "g1", "g4"]);
    expect(app.tasks.length).toBe(7);
  });
});
