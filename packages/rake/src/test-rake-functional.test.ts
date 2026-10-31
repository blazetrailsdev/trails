import { Dir, FileUtils, File, regexpEscape, setEnv } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { useApplicationTestCase } from "./test-helpers/application.js";
import * as d from "./test-helpers/rakefile-definitions.js";
import { rake, ruby, RUBY, runner, runRuby, useRubyRunner } from "./test-helpers/ruby-runner.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const shown = new RegExp(`${regexpEscape(RUBY)} -e`);

function dryrunTasks(): string[] {
  return runner.err
    .split("\n")
    .filter((line) => /^\*\* Execute/.test(line))
    .map((line) => line.replace(/^\*\* Execute \(dry run\) /, ""));
}

describe("TestRakeFunctional", () => {
  const state = useApplicationTestCase();
  useRubyRunner();

  it("rake default", async () => {
    await d.rakefileDefault();
    await rake();
    expect(runner.out).toMatch(/^DEFAULT$/m);
  });

  it("rake error on bad task", async () => {
    await d.rakefileDefault();
    await rake("-t", "xyz");
    expect(runner.err).toMatch(/rake aborted/);
  });

  it("env available at top scope", async () => {
    await d.rakefileDefault();
    await rake("TESTTOPSCOPE=1");
    expect(runner.out).toMatch(/^TOPSCOPE$/m);
  });

  it("env available at task scope", async () => {
    await d.rakefileDefault();
    await rake("TESTTASKSCOPE=1", "task_scope");
    expect(runner.out).toMatch(/^TASKSCOPE$/m);
  });

  it("task override", async () => {
    await d.rakefileOverride();
    await rake("t1");
    expect(runner.out).toMatch(/foo\nbar\n/);
  });

  it("multi desc", async () => {
    setEnv("RAKE_COLUMNS", "80");
    await d.rakefileMultidesc();
    await rake("-T");
    expect(runner.out).toMatch(/^rake a *# A \/ A2 *$/m);
    expect(runner.out).toMatch(/^rake b *# B *$/m);
    expect(runner.out).not.toMatch(/^rake c/m);
    expect(runner.out).toMatch(/^rake d *# x{65}\.\.\.$/m);
  });

  it("long description", async () => {
    await d.rakefileMultidesc();
    await rake("--describe");
    expect(runner.out).toMatch(/^rake a\n *A\n *A2 *$/m);
    expect(runner.out).toMatch(/^rake b\n *B *$/m);
    expect(runner.out).toMatch(/^rake d\n *x{80}/m);
    expect(runner.out).not.toMatch(/^rake c\n/m);
  });

  it("proper namespace access", async () => {
    await d.rakefileAccess();
    await rake();
    expect(runner.out).not.toMatch(/^BAD:/m);
  });

  it("rbext", async () => {
    await d.rakefileRbext();
    await rake("-N");
    expect(runner.out).toMatch(/^OK$/m);
  });

  it("system", async () => {
    await d.rakeSystemDir();
    await rake("-g", "sys1");
    expect(runner.out).toMatch(/^SYS1/m);
  });

  it("system excludes rakelib files too", async () => {
    await d.rakeSystemDir();
    await rake("-g", "sys1", "-T", "extra");
    expect(runner.out).not.toMatch(/extra:extra/);
  });

  it("by default rakelib files are included", async () => {
    await d.rakeSystemDir();
    await d.rakefileExtra();
    await rake("-T", "extra", "--trace");
    expect(runner.out).toMatch(/extra:extra/);
  });

  it("implicit system", async () => {
    await d.rakeSystemDir();
    Dir.chdir(state.tempdir);
    await rake("sys1", "--trace");
    expect(runner.out).toMatch(/^SYS1/m);
  });

  it("no system", async () => {
    await d.rakeSystemDir();
    await d.rakefileExtra();
    await rake("-G", "sys1");
    expect(runner.err).toMatch(/^Don't know how to build task/m);
  });

  it("nosearch with rakefile uses local rakefile", async () => {
    await d.rakefileDefault();
    await rake("--nosearch");
    expect(runner.out).toMatch(/^DEFAULT/m);
  });

  it("nosearch without rakefile finds system", async () => {
    await d.rakefileNosearch();
    await d.rakeSystemDir();
    await rake("--nosearch", "sys1");
    expect(runner.out).toMatch(/^SYS1/m);
  });

  it("nosearch without rakefile and no system fails", async () => {
    await d.rakefileNosearch();
    setEnv("RAKE_SYSTEM", "not_exist");
    await rake("--nosearch");
    expect(runner.err).toMatch(/^No Rakefile found/m);
  });

  it("invalid command line options", async () => {
    await d.rakefileDefault();
    await rake("--bad-options");
    expect(runner.err).toMatch(/invalid +option/i);
  });

  it("inline verbose default should show command", async () => {
    await d.rakefileVerbose();
    await rake("inline_verbose_default");
    expect(runner.err).toMatch(shown);
  });

  it("inline verbose true should show command", async () => {
    await d.rakefileVerbose();
    await rake("inline_verbose_true");
    expect(runner.err).toMatch(shown);
  });

  it("inline verbose false should not show command", async () => {
    await d.rakefileVerbose();
    await rake("inline_verbose_false");
    expect(runner.err).not.toMatch(shown);
  });

  it("block verbose false should not show command", async () => {
    await d.rakefileVerbose();
    await rake("block_verbose_false");
    expect(runner.err).not.toMatch(shown);
  });

  it("block verbose true should show command", async () => {
    await d.rakefileVerbose();
    await rake("block_verbose_true");
    expect(runner.err).toMatch(shown);
  });

  it("standalone verbose true should show command", async () => {
    await d.rakefileVerbose();
    await rake("standalone_verbose_true");
    expect(runner.err).toMatch(shown);
  });

  it("standalone verbose false should not show command", async () => {
    await d.rakefileVerbose();
    await rake("standalone_verbose_false");
    expect(runner.err).not.toMatch(shown);
  });

  it("dry run", async () => {
    await d.rakefileDefault();
    await rake("-n", "other");
    expect(runner.err).toMatch(/Execute \(dry run\) default/);
    expect(runner.err).toMatch(/Execute \(dry run\) other/);
    expect(runner.out).not.toMatch(/DEFAULT/);
    expect(runner.out).not.toMatch(/OTHER/);
  });

  it("dry run bug", async () => {
    await d.rakefileDryrun();
    await rake();
    await FileUtils.rmFAsync("temp_one");
    await rake("--dry-run");
    expect(runner.out).not.toMatch(/No such file/);
  });

  it("trace bug", async () => {
    await d.rakefileDryrun();
    await rake();
    await FileUtils.rmFAsync("temp_one");
    await rake("--trace");
    expect(runner.out).not.toMatch(/No such file/);
  });

  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/loaders/makefile` is unported.
  it.skip("imports", () => {});

  it("regenerate imports", async () => {
    await d.rakefileRegenerateImports();
    await rake();
    expect(runner.out).toMatch(/^INITIAL\s+^REGENERATED$/m);
  });

  it("rules chaining to file task", async () => {
    await d.rakefileChains();
    await rake();
    expect(await File.isExistAsync(File.join(state.tempdir, "play.app"))).toBeTruthy();
  });

  it("update midway through chaining to file task", { timeout: 30000 }, async () => {
    await d.rakefileFileChains();
    await rake("-n");
    expect(dryrunTasks()).toEqual(["fileA", "fileB", "fileC", "default"]);
    await rake();
    await sleep(1000);
    await FileUtils.touchAsync("fileA");
    await rake("-n");
    expect(dryrunTasks()).toEqual(["fileB", "fileC", "default"]);
  });

  it("file creation task", { timeout: 30000 }, async () => {
    await d.rakefileFileCreation();
    await rake("prep");
    await rake("run");
    await rake("run");
    expect(!/^cp src/m.test(runner.err)).toBeTruthy();
  });

  it("dash f with no arg foils rakefile lookup", async () => {
    await d.rakefileRakelib();
    await rake("-I", "rakelib", "-rtest1", "-f");
    expect(runner.out).toMatch(/^TEST1$/m);
  });

  it("dot rake files can be loaded with dash r", async () => {
    await d.rakefileRakelib();
    await rake("-I", "rakelib", "-rtest2", "-f");
    expect(runner.err).toBeEmpty();
    expect(runner.out).toMatch(/^TEST2$/m);
  });

  it("can invoke task in toplevel namespace", async () => {
    await d.rakefileNamespace();
    await rake("copy");
    expect(runner.out).toMatch(/^COPY$/m);
  });

  it("can invoke task in nested namespace", async () => {
    await d.rakefileNamespace();
    await rake("nest:copy");
    expect(runner.out).toMatch(/^NEST COPY$/m);
  });

  it("tasks can reference task in same namespace", async () => {
    await d.rakefileNamespace();
    await rake("nest:xx");
    expect(runner.out).toMatch(/^NEST COPY$/m);
  });

  it("tasks can reference task in other namespaces", async () => {
    await d.rakefileNamespace();
    await rake("b:run");
    expect(runner.out).toMatch(/^IN A\nIN B$/m);
  });

  it("anonymous tasks can be invoked indirectly", async () => {
    await d.rakefileNamespace();
    await rake("anon");
    expect(runner.out).toMatch(/^ANON COPY$/m);
  });

  it("rake namespace refers to toplevel", async () => {
    await d.rakefileNamespace();
    await rake("very:nested:run");
    expect(runner.out).toMatch(/^COPY$/m);
  });

  it("file task are not scoped by namespaces", async () => {
    await d.rakefileNamespace();
    await rake("xyz.rb");
    expect(runner.out).toMatch(/^XYZ1\nXYZ2$/m);
  });

  it("file task dependencies scoped by namespaces", async () => {
    await d.rakefileNamespace();
    await rake("scopedep.rb");
    expect(runner.out).toMatch(/^PREPARE\nSCOPEDEP$/m);
  });

  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/testtask` is unported.
  it.skip("test task descriptions", () => {});
  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/testtask` is unported.
  it.skip("test task when verbose unless verbose passed not prompt testopts", () => {});
  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/testtask` is unported.
  it.skip("test task when verbose passed prompts testopts", () => {});

  it("comment before task acts like desc", async () => {
    await d.rakefileComments();
    await rake("-T");
    expect(runner.out).not.toMatch(/comment for t1/);
  });

  it("comment separated from task by blank line is not picked up", async () => {
    await d.rakefileComments();
    await rake("-T");
    expect(runner.out).not.toMatch(/t2/);
  });

  it("comment after desc is ignored", async () => {
    await d.rakefileComments();
    await rake("-T");
    expect(runner.out).toMatch("override comment for t3");
  });

  it("comment before desc is ignored", async () => {
    await d.rakefileComments();
    await rake("-T");
    expect(runner.out).toMatch("override comment for t4");
  });

  it("correct number of tasks reported", async () => {
    await d.rakefileComments();
    await rake("-T");
    expect(runner.out.split(/\n/).filter((line) => /t\d/.test(line)).length).toBe(2);
  });

  it("file list is requirable separately", async () => {
    await File.writeAsync(
      "size.ts",
      'import { FileList } from "@blazetrails/rake/file-list";\n' +
        'console.log(await new FileList("a").size());\n',
    );
    await ruby("size.ts");
    expect(runner.out).toBe("1\n");
  });

  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/testtask` is unported.
  it.skip("signal propagation in tests", () => {});
  // BLOCKED: rake-testtask-and-makefile-loader-port, `rake/testtask` is unported.
  it.skip("failing test sets exit status", () => {});

  it("stand alone filelist", async () => {
    await d.rakefileStandAloneFilelist();
    await runRuby(["stand_alone_filelist.ts"]);
    expect(runner.out).toMatch(/^stand_alone_filelist\.ts$/m);
    expect(runner.exit!.exitstatus()).toBe(0);
  });
});
