import { beforeEach, describe, expect, it } from "vitest";
import {
  RuntimeError,
  block,
  puts,
  rbObjMethod,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
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

const rule = (key: unknown, value: unknown, action?: (t: Task, args: TaskArguments) => unknown) =>
  action ? dsl.rule(new Map([[key, value]]), block(action)) : dsl.rule(new Map([[key, value]]));
const ruleWithArgs = (
  pattern: string | RegExp,
  value: unknown,
  action: (t: Task, args: TaskArguments) => unknown,
) => dsl.rule(pattern, new Map([[["a"], value]]), block(action));

describe("TestRakeRules", () => {
  useRakeTestCase();
  let runs: string[];
  const name = (t: Task) => void runs.push(t.name);
  const nameAndSource = (t: Task) => void runs.push(`${t.name} - ${t.source}`);
  const log = (entry: string) => () => void runs.push(entry);
  const invoke = async (taskName: string, ...args: unknown[]) =>
    (await Task.get(taskName)).invoke(...args);

  beforeEach(() => {
    Task.clear();
    runs = [];
  });

  it("multiple rules1", async () => {
    await createFile(FTNFILE);
    await deleteFile(SRCFILE);
    await deleteFile(OBJFILE);
    rule(/\.o$/, [".c"], log("C"));
    rule(/\.o$/, [".f"], log("F"));
    const t = await Task.get(OBJFILE);
    await t.invoke();
    await invoke(OBJFILE);
    expect(runs).toEqual(["F"]);
  });

  it("multiple rules2", async () => {
    await createFile(FTNFILE);
    await deleteFile(SRCFILE);
    await deleteFile(OBJFILE);
    rule(/\.o$/, [".f"], log("F"));
    rule(/\.o$/, [".c"], log("C"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["F"]);
  });

  it("create with source", async () => {
    await createFile(SRCFILE);
    rule(/\.o$/, [".c"], (t) => {
      runs.push(t.name);
      expect(t.name).toEqual(OBJFILE);
      expect(t.source).toEqual(SRCFILE);
    });
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("single dependent", async () => {
    await createFile(SRCFILE);
    rule(/\.o$/, ".c", name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule can be created by string", async () => {
    await createFile(SRCFILE);
    rule(".o", [".c"], name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule prereqs can be created by string", async () => {
    await createFile(SRCFILE);
    rule(".o", ".c", name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("rule prereqs can be created by symbol", async () => {
    dsl.task("nonfile", block(name));
    rule(".o", "nonfile", name);
    await invoke(OBJFILE);
    expect(runs).toEqual(["nonfile", OBJFILE]);
  });

  it("plain strings as dependents refer to files", async () => {
    await createFile(SRCFILE);
    rule(".o", SRCFILE, name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("file names beginning with dot can be tricked into referring to file", async () => {
    await dsl.verbose(false, async () => {
      await createFile(".foo");
      rule(".o", "./.foo", name);
      await invoke(OBJFILE);
      expect(runs).toEqual([OBJFILE]);
    });
  });

  it("file names beginning with dot can be wrapped in lambda", async () => {
    await dsl.verbose(false, async () => {
      await createFile(".foo");
      rule(".o", () => ".foo", nameAndSource);
      await invoke(OBJFILE);
      expect(runs).toEqual([`${OBJFILE} - .foo`]);
    });
  });

  it("file names containing percent can be wrapped in lambda", async () => {
    await dsl.verbose(false, async () => {
      await createFile("foo%x");
      rule(".o", () => "foo%x", nameAndSource);
      await invoke(OBJFILE);
      expect(runs).toEqual([`${OBJFILE} - foo%x`]);
    });
  });

  it("non extension rule name refers to file", async () => {
    await dsl.verbose(false, async () => {
      await createFile("abc.c");
      rule("abc", ".c", name);
      await invoke("abc");
      expect(runs).toEqual(["abc"]);
    });
  });

  it("pathmap automatically applies to name", async () => {
    await dsl.verbose(false, async () => {
      await createFile("zzabc.c");
      rule(".o", "zz%{x,a}n.c", nameAndSource);
      await invoke("xbc.o");
      expect(runs).toEqual(["xbc.o - zzabc.c"]);
    });
  });

  it("plain strings are just filenames", async () => {
    await dsl.verbose(false, async () => {
      await createFile("plainname");
      rule(".o", "plainname", nameAndSource);
      await invoke("xbc.o");
      expect(runs).toEqual(["xbc.o - plainname"]);
    });
  });

  it("rule runs when explicit task has no actions", async () => {
    await createFile(SRCFILE);
    await createFile(SRCFILE2);
    await deleteFile(OBJFILE);
    rule(".o", ".c", (t) => void runs.push(t.source!));
    dsl.file({ [OBJFILE]: [SRCFILE2] });
    await invoke(OBJFILE);
    expect(runs).toEqual([SRCFILE]);
  });

  it("close matches on name do not trigger rule", async () => {
    await createFile("x.c");
    rule(".o", [".c"], name);
    await expect(invoke("x.obj")).rejects.toThrow(RuntimeError);
    await expect(invoke("x.xyo")).rejects.toThrow(RuntimeError);
  });

  it("rule rebuilds obj when source is newer", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    rule(/\.o$/, [".c"], log("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE"]);
  });

  it("rule with two sources runs if both sources are present", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    rule(OBJFILE, [() => SRCFILE, () => SRCFILE2], log("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE"]);
  });

  it("rule with two sources but one missing does not run", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    await deleteFile(SRCFILE2);
    rule(OBJFILE, [() => SRCFILE, () => SRCFILE2], log("RULE"));
    await invoke(OBJFILE);
    expect(runs).toEqual([]);
  });

  it("rule with two sources builds both sources", async () => {
    dsl.task("x.aa");
    dsl.task("x.bb");
    rule(".a", ".aa", log("A"));
    rule(".b", ".bb", log("B"));
    rule(".c", [".a", ".b"], log("C"));
    await invoke("x.c");
    expect([...runs].sort()).toEqual(["A", "B", "C"]);
  });

  it("second rule runs when first rule doesnt", async () => {
    await createTimedFiles(OBJFILE, SRCFILE);
    await deleteFile(SRCFILE2);
    rule(OBJFILE, [() => SRCFILE, () => SRCFILE2], log("RULE1"));
    rule(OBJFILE, [() => SRCFILE], log("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE2"]);
  });

  it("second rule doest run if first triggers", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    rule(OBJFILE, [() => SRCFILE, () => SRCFILE2], log("RULE1"));
    rule(OBJFILE, [() => SRCFILE], log("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE1"]);
  });

  it("second rule doest run if first triggers with reversed rules", async () => {
    await createTimedFiles(OBJFILE, SRCFILE, SRCFILE2);
    rule(OBJFILE, [() => SRCFILE], log("RULE1"));
    rule(OBJFILE, [() => SRCFILE, () => SRCFILE2], log("RULE2"));
    await invoke(OBJFILE);
    expect(runs).toEqual(["RULE1"]);
  });

  it("rule with proc dependent will trigger", async () => {
    await dsl.mkdirP("src/jw");
    await createFile("src/jw/X.java");
    rule(/classes\/.*\.class/, [(fn: string) => pathmap(fn, "%{classes,src}d/%n.java")], (task) => {
      expect(task.name).toEqual("classes/jw/X.class");
      expect(task.source).toEqual("src/jw/X.java");
      runs.push("RULE");
    });
    await invoke("classes/jw/X.class");
    expect(runs).toEqual(["RULE"]);
  });

  it("proc returning lists are flattened into prereqs", async () => {
    let ran = false;
    await dsl.mkdirP("flatten");
    await createFile("flatten/a.txt");
    dsl.task(
      "flatten/b.data",
      block(async (t: Task) => {
        ran = true;
        await dsl.touch(t.name, { verbose: false });
      }),
    );
    rule(
      ".html",
      (fn: string) => [ext(fn, "txt"), "flatten/b.data"],
      () => {},
    );
    await invoke("flatten/a.html");
    expect(ran).toBeTruthy();
  });

  it("recursive rules will work as long as they terminate", async () => {
    const actions: string[] = [];
    await createFile("abc.xml");
    rule(".y", ".xml", () => void actions.push("y"));
    rule(".c", ".y", () => void actions.push("c"));
    rule(".o", ".c", () => void actions.push("o"));
    rule(".exe", ".o", () => void actions.push("exe"));
    await invoke("abc.exe");
    expect(actions).toEqual(["y", "c", "o", "exe"]);
  });

  it("recursive rules that dont terminate will overflow", async () => {
    await createFile("a.a");
    let prev = "a";
    for (const letter of "bcdefghijklmnopqrstuvwxyz") {
      rule(`.${letter}`, `.${prev}`, (t) => puts.call($stdout, t.name));
      prev = letter;
    }
    let ex: Error;
    await expect(
      invoke("a.z").catch((e: Error) => {
        ex = e;
        throw e;
      }),
    ).rejects.toThrow(RuleRecursionOverflowError);
    expect(ex!.message).toMatch(/a\.z => a.y/);
  });

  it("rules with bad dependents will fail", async () => {
    rule("a", [1], (t) => puts.call($stdout, t.name));
    await expect(invoke("a")).rejects.toThrow(RuntimeError);
  });

  it("string rule with args", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    ruleWithArgs(".o", SRCFILE, (_t, args) => {
      expect(args.a).toEqual("arg");
    });
    await invoke(OBJFILE, "arg");
  });

  it("regex rule with args", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    ruleWithArgs(/.o$/, SRCFILE, (_t, args) => {
      expect(args.a).toEqual("arg");
    });
    await invoke(OBJFILE, "arg");
  });

  it("single dependent with nil args", async () => {
    await createFile(SRCFILE);
    rule(null, ".cpp", (t) => puts.call($stdout, rbInspect(t.name)));
    rule(/\.o$/, ".c", name);
    await invoke(OBJFILE);
    expect(runs).toEqual([OBJFILE]);
  });

  it("string rule with args and lambda prereq", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    ruleWithArgs(".o", [() => SRCFILE], (_t, args) => {
      expect(args.a).toEqual("arg");
    });
    await invoke(OBJFILE, "arg");
  });

  it("regex rule with args and lambda prereq", async () => {
    await deleteFile(OBJFILE);
    await createFile(SRCFILE);
    ruleWithArgs(/.o$/, [() => SRCFILE], (_t, args) => {
      expect(args.a).toEqual("arg");
    });
    await invoke(OBJFILE, "arg");
  });

  it("rule with method prereq", async () => {
    await createFile(".foo");
    const obj = {
      findPrereq() {
        return ".foo";
      },
    };
    rule(".o", rbObjMethod(obj, "findPrereq"), nameAndSource);
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
    rule(".o", rbObjMethod(obj, "findPrereq"), nameAndSource);
    await invoke(OBJFILE);
    expect(runs).toEqual([`${OBJFILE} - abc.c`]);
  });

  it("works with chained extensions in rules", async () => {
    await createFile(OBJFILE);
    rule(".min.o", [".o"], (t) => {
      runs.push(t.name);
      expect(t.source).toEqual(OBJFILE);
      expect(t.name).toEqual(MINFILE);
    });
    await invoke(MINFILE);
    expect(runs).toEqual([MINFILE]);
  });
});
