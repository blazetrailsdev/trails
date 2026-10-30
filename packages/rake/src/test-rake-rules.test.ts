import { beforeEach, describe, expect, it } from "vitest";
import { FileUtils, RuntimeError, block } from "@blazetrails/ruby-compat";
import { ext, pathmap } from "./ext/string.js";
import { RuleRecursionOverflowError } from "./rule-recursion-overflow-error.js";
import { Task } from "./task.js";
import type { TaskArguments } from "./task-arguments.js";
import {
  createFile,
  createTimedFiles,
  deleteFile,
  dsl,
  useRakeTestCase,
} from "./test-helpers/file-creation.js";

const SRCFILE = "abc.c";
const SRCFILE2 = "xyz.c";
const FTNFILE = "abc.f";
const OBJFILE = "abc.o";
const MINFILE = "abc.min.o";

describe("TestRakeRules", () => {
  const rake = useRakeTestCase();
  let runs: string[];
  const name = block((t: Task) => void runs.push(t.name));
  const nameAndSource = block((t: Task) => void runs.push(`${t.name} - ${t.source}`));
  const push = (mark: string) => block(() => void runs.push(mark));
  const invoke = async (taskName: string, ...args: unknown[]) =>
    (await Task.get(taskName)).invoke(...args);

  beforeEach(() => {
    rake.tm.clear();
    runs = [];
  });

  it("multiple rules1", async () => {
    await createFile(FTNFILE);
    await deleteFile(SRCFILE);
    await deleteFile(OBJFILE);
    dsl.rule(new Map([[/\.o$/, [".c"]]]), push("C"));
    dsl.rule(new Map([[/\.o$/, [".f"]]]), push("F"));
    const t = await Task.get(OBJFILE);
    await t.invoke();
    await invoke(OBJFILE);
    expect(runs).toEqual(["F"]);
  });

  it("multiple rules2", async () => {
    await createFile(FTNFILE);
    await deleteFile(SRCFILE);
    await deleteFile(OBJFILE);
    dsl.rule(new Map([[/\.o$/, [".f"]]]), push("F"));
    dsl.rule(new Map([[/\.o$/, [".c"]]]), push("C"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["F"]);
  });

  it("create with source", async () => {
    await createFile(SRCFILE);
    dsl.rule(
      new Map([[/\.o$/, [".c"]]]),
      block((t: Task) => {
        runs.push(t.name);
        expect(t.name).toEqual(OBJFILE);
        expect(t.source).toEqual(SRCFILE);
      }),
    );
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("single dependent", async () => {
    await createFile(SRCFILE);
    dsl.rule(new Map([[/\.o$/, ".c"]]), name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule can be created by string", async () => {
    await createFile(SRCFILE);
    dsl.rule({ ".o": [".c"] }, name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule prereqs can be created by string", async () => {
    await createFile(SRCFILE);
    dsl.rule({ ".o": ".c" }, name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule prereqs can be created by symbol", async () => {
    dsl.task("nonfile", name);
    dsl.rule({ ".o": "nonfile" }, name);
    await invoke(OBJFILE);
    expect(runs).toEqual(["nonfile", OBJFILE]);
  });

  it("plain strings as dependents refer to files", async () => {
    await createFile(SRCFILE);
    dsl.rule({ ".o": SRCFILE }, name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("file names beginning with dot can be tricked into referring to file", async () => {
    await createFile(".foo");
    dsl.rule({ ".o": "./.foo" }, name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("file names beginning with dot can be wrapped in lambda", async () => {
    await createFile(".foo");
    dsl.rule({ ".o": () => ".foo" }, nameAndSource);
    await invoke(OBJFILE);
    expect(runs).toEqual([`${OBJFILE} - .foo`]);
  });

  it("file names containing percent can be wrapped in lambda", async () => {
    await createFile("foo%x");
    dsl.rule({ ".o": () => "foo%x" }, nameAndSource);
    await invoke(OBJFILE);
    expect(runs).toEqual([`${OBJFILE} - foo%x`]);
  });

  it("non extension rule name refers to file", async () => {
    await createFile("abc.c");
    dsl.rule({ abc: ".c" }, name);
    await invoke("abc");
    expect(runs).toEqual(["abc"]);
  });

  it("pathmap automatically applies to name", async () => {
    await createFile("zzabc.c");
    dsl.rule({ ".o": "zz%{x,a}n.c" }, nameAndSource);
    await invoke("xbc.o");
    expect(runs).toEqual(["xbc.o - zzabc.c"]);
  });

  it("plain strings are just filenames", async () => {
    await createFile("plainname");
    dsl.rule({ ".o": "plainname" }, nameAndSource);
    await invoke("xbc.o");
    expect(runs).toEqual(["xbc.o - plainname"]);
  });

  it("rule runs when explicit task has no actions", async () => {
    await createFile(SRCFILE);
    await createFile(SRCFILE2);
    await deleteFile(OBJFILE);
    dsl.rule(
      { ".o": ".c" },
      block((t: Task) => void runs.push(t.source!)),
    );
    dsl.file({ [OBJFILE]: [SRCFILE2] });
    await invoke(OBJFILE);
    expect(runs).toEqual([SRCFILE]);
  });

  it("close matches on name do not trigger rule", async () => {
    await createFile("x.c");
    dsl.rule({ ".o": [".c"] }, name);
    await expect(invoke("x.obj")).rejects.toThrow(RuntimeError);
    await expect(invoke("x.xyo")).rejects.toThrow(RuntimeError);
  });

  it("rule rebuilds obj when source is newer", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    dsl.rule(new Map([[/\.o$/, [".c"]]]), push("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE"]);
  });

  it("rule with two sources runs if both sources are present", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    dsl.rule({ [OBJFILE]: [() => SRCFILE, () => SRCFILE2] }, push("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE"]);
  });

  it("rule with two sources but one missing does not run", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    await deleteFile(SRCFILE2);
    dsl.rule({ [OBJFILE]: [() => SRCFILE, () => SRCFILE2] }, push("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual([]);
  });

  it("rule with two sources builds both sources", async () => {
    dsl.task("x.aa");
    dsl.task("x.bb");
    dsl.rule({ ".a": ".aa" }, push("A"));
    dsl.rule({ ".b": ".bb" }, push("B"));
    dsl.rule({ ".c": [".a", ".b"] }, push("C"));
    await invoke("x.c");
    expect([...runs].sort()).toEqual(["A", "B", "C"]);
  });

  it("second rule runs when first rule doesnt", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    await deleteFile(SRCFILE2);
    dsl.rule({ [OBJFILE]: [() => SRCFILE, () => SRCFILE2] }, push("RULE1"));
    dsl.rule({ [OBJFILE]: [() => SRCFILE] }, push("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE2"]);
  });

  it("second rule doest run if first triggers", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    dsl.rule({ [OBJFILE]: [() => SRCFILE, () => SRCFILE2] }, push("RULE1"));
    dsl.rule({ [OBJFILE]: [() => SRCFILE] }, push("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE1"]);
  });

  it("second rule doest run if first triggers with reversed rules", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    dsl.rule({ [OBJFILE]: [() => SRCFILE] }, push("RULE1"));
    dsl.rule({ [OBJFILE]: [() => SRCFILE, () => SRCFILE2] }, push("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE1"]);
  });

  it("rule with proc dependent will trigger", async () => {
    await FileUtils.mkdirPAsync("src/jw");
    await createFile("src/jw/X.java");
    dsl.rule(
      new Map([[/classes\/.*\.class/, [(fn: string) => pathmap(fn, "%{classes,src}d/%n.java")]]]),
      block((task: Task) => {
        expect("classes/jw/X.class").toEqual(task.name);
        expect("src/jw/X.java").toEqual(task.source);
        runs.push("RULE");
      }),
    );
    await invoke("classes/jw/X.class");
    expect(runs).toEqual(["RULE"]);
  });

  it("proc returning lists are flattened into prereqs", async () => {
    let ran = false;
    await FileUtils.mkdirPAsync("flatten");
    await createFile("flatten/a.txt");
    dsl.task(
      "flatten/b.data",
      block(async (t: Task) => {
        ran = true;
        await FileUtils.touchAsync(t.name);
      }),
    );
    dsl.rule(
      { ".html": (fn: string) => [ext(fn, "txt"), "flatten/b.data"] },
      block(() => {}),
    );
    await invoke("flatten/a.html");
    expect(ran).toBeTruthy();
  });

  it("recursive rules will work as long as they terminate", async () => {
    const actions: string[] = [];
    const act = (mark: string) => block(() => void actions.push(mark));
    await createFile("abc.xml");
    dsl.rule({ ".y": ".xml" }, act("y"));
    dsl.rule({ ".c": ".y" }, act("c"));
    dsl.rule({ ".o": ".c" }, act("o"));
    dsl.rule({ ".exe": ".o" }, act("exe"));
    await invoke("abc.exe");
    expect(actions).toEqual(["y", "c", "o", "exe"]);
  });

  it("recursive rules that dont terminate will overflow", async () => {
    await createFile("a.a");
    let prev = "a";
    for (const letter of "bcdefghijklmnopqrstuvwxyz") {
      dsl.rule({ [`.${letter}`]: `.${prev}` }, name);
      prev = letter;
    }
    const ex = await invoke("a.z").catch((e: unknown) => e);
    expect(ex).toBeInstanceOf(RuleRecursionOverflowError);
    expect((ex as Error).message).toMatch(/a\.z => a.y/);
  });

  it("rules with bad dependents will fail", async () => {
    dsl.rule({ a: [1] }, name);
    await expect(invoke("a")).rejects.toThrow(RuntimeError);
  });

  const argA = block((_t: Task, args: TaskArguments) => {
    expect((args as unknown as { a: string }).a).toEqual("arg");
  });

  it("string rule with args", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    dsl.rule(".o", new Map([[["a"], SRCFILE]]), argA);
    await invoke(OBJFILE, "arg");
  });

  it("regex rule with args", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    dsl.rule(/.o$/, new Map([[["a"], SRCFILE]]), argA);
    await invoke(OBJFILE, "arg");
  });

  it("single dependent with nil args", async () => {
    await createFile(SRCFILE);
    dsl.rule(new Map([[null, ".cpp"]]), name);
    dsl.rule(new Map([[/\.o$/, ".c"]]), name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("string rule with args and lambda prereq", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    dsl.rule(".o", new Map([[["a"], [() => SRCFILE]]]), argA);
    await invoke(OBJFILE, "arg");
  });

  it("regex rule with args and lambda prereq", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    dsl.rule(/.o$/, new Map([[["a"], [() => SRCFILE]]]), argA);
    await invoke(OBJFILE, "arg");
  });

  it("rule with method prereq", async () => {
    await createFile(".foo");
    const obj = {
      findPrereq() {
        return ".foo";
      },
    };
    dsl.rule({ ".o": obj.findPrereq.bind(obj) }, nameAndSource);
    await invoke(OBJFILE);
    expect(runs).toEqual([`${OBJFILE} - .foo`]);
  });

  it("rule with one arg method prereq", async () => {
    await createFile(SRCFILE);
    const obj = {
      findPrereq(taskName: string) {
        return ext(taskName, ".c");
      },
    };
    dsl.rule({ ".o": obj.findPrereq.bind(obj) }, nameAndSource);
    await invoke(OBJFILE);
    expect(runs).toEqual([`${OBJFILE} - abc.c`]);
  });

  it("works with chained extensions in rules", async () => {
    await createFile(OBJFILE);
    dsl.rule(
      { ".min.o": [".o"] },
      block((t: Task) => {
        runs.push(t.name);
        expect(t.source).toEqual(OBJFILE);
        expect(t.name).toEqual(MINFILE);
      }),
    );
    await invoke(MINFILE);
    expect(runs).toEqual([MINFILE]);
  });
});
