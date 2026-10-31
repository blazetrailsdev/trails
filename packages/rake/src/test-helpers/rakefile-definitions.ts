import { File, FileUtils, setEnv } from "@blazetrails/ruby-compat";
import { RUBY } from "./ruby-runner.js";

const PRELUDE =
  'import { FileList, Rake, main as self } from "@blazetrails/rake"; ' +
  'import { File, RuntimeError, block, env as ENV } from "@blazetrails/ruby-compat"; ' +
  "const { task, file, multitask, rule, desc, namespace } = self; ";

export async function rakefile(contents: string, name = "Rakefile.ts"): Promise<void> {
  await File.writeAsync(name, PRELUDE + contents);
}

export async function rakeSystemDir(): Promise<void> {
  await FileUtils.mkdirPAsync("system");
  await rakefile(`task("sys1", block(() => console.log("SYS1")));\n`, "system/sys1.ts");
  setEnv("RAKE_SYSTEM", "system");
}

export function rakefileAccess(): Promise<void> {
  return rakefile(`
const TOP_LEVEL_CONSTANT = 0;
function aTopLevelFunction() {}
task({ default: ["work", "obj", "const"] });
task("work", block(() => {
  try {
    aTopLevelFunction();
    console.log("GOOD:M Top level methods can be called in tasks");
  } catch {
    console.log("BAD:M  Top level methods can not be called in tasks");
  }
}));
task("obj", block(() => {
  try {
    ({}).task("xyzzy");
    console.log("BAD:D  Rake DSL are polluting objects");
  } catch {
    console.log("GOOD:D Rake DSL are not polluting objects");
  }
}));
task("const", block(() => {
  try {
    TOP_LEVEL_CONSTANT;
    console.log("GOOD:C Top level constants are available in tasks");
  } catch {
    console.log("BAD:C  Top level constants are NOT available in tasks");
  }
}));
`);
}

export function rakefileChains(): Promise<void> {
  return rakefile(`
task({ default: "play.app" });
file({ "play.scpt": "base" }, block((t) => self.cp(t.prerequisites[0], t.name)));
rule({ ".app": ".scpt" }, block((t) => self.cp(t.source, t.name)));
file("base", block(() => self.touch("base")));
`);
}

export function rakefileFileChains(): Promise<void> {
  return rakefile(`
file("fileA", block((t) => self.sh(\`echo contentA >\${t.name}\`)));
file({ fileB: "fileA" }, block((t) => self.sh(\`(cat fileA; echo transformationB) >\${t.name}\`)));
file({ fileC: "fileB" }, block((t) => self.sh(\`(cat fileB; echo transformationC) >\${t.name}\`)));
task({ default: "fileC" });
`);
}

export function rakefileComments(): Promise<void> {
  return rakefile(`
// comment for t1
task("t1", block(() => {}));

// no comment or task because there's a blank line

task("t2", block(() => {}));

desc("override comment for t3");
// this is not the description
multitask("t3", block(() => {}));

// this is not the description
desc("override comment for t4");
file("t4", block(() => {}));
`);
}

export function rakefileOverride(): Promise<void> {
  return rakefile(`
task("t1", block(() => console.log("foo")));
task("t1", block(() => console.log("bar")));
`);
}

export function rakefileDefault(): Promise<void> {
  return rakefile(`
if (ENV["TESTTOPSCOPE"]) {
  console.log("TOPSCOPE");
}
task("default", block(() => console.log("DEFAULT")));
task({ other: ["default"] }, block(() => console.log("OTHER")));
task("task_scope", block(() => {
  if (ENV["TESTTASKSCOPE"]) {
    console.log("TASKSCOPE");
  }
}));
`);
}

export async function rakefileDryrun(): Promise<void> {
  await rakefile(`
task({ default: ["temp_main"] });
file({ temp_main: ["all_apps"] }, block(() => self.touch("temp_main")));
task({ all_apps: ["one", "two"] });
task({ one: ["temp_one"] });
task({ two: ["temp_two"] });
file("temp_one", block(() => self.touch("temp_one")));
file("temp_two", block(() => self.touch("temp_two")));
task("clean", block(async () => {
  for (const file of ["temp_one", "temp_two", "temp_main"]) await self.rmF(file);
}));
`);
  await FileUtils.touchAsync("temp_main");
  await FileUtils.touchAsync("temp_two");
}

export async function rakefileExtra(): Promise<void> {
  await rakefile(`task("default");\n`);
  await FileUtils.mkdirPAsync("rakelib");
  await rakefile(
    `// Added for testing

namespace("extra", () => {
  desc("An Extra Task");
  task("extra", block(() => console.log("Read all about it")));
});
`,
    File.join("rakelib", "extra.ts"),
  );
}

export function rakefileFileCreation(): Promise<void> {
  return rakefile(`
const N = 2;
task({ default: "run" });
task("clean", block(async () => {
  await self.rmRf("build");
  await self.rmRf("src");
}));
task("run");
const TARGET_DIR = "build/copies";
for (const src of await FileList.glob("src/*")) {
  await self.directory(TARGET_DIR);
  const target = TARGET_DIR + "/" + src.split("/").at(-1);
  file({ [target]: [src, TARGET_DIR] }, block(() => self.cp(src, target)));
  task({ run: target });
}
task({ prep: "clean" }, block(async () => {
  await self.mkdirP("src");
  for (let n = 0; n < N; n++) await self.touch(\`src/foo\${n}\`);
}));
`);
}

export async function rakefileRegenerateImports(): Promise<void> {
  await rakefile(`
task("default");
task("regenerate", block(() => File.writeAsync("deps.ts", ${JSON.stringify(PRELUDE)} + \`file({ "deps.ts": "regenerate" });
console.log("REGENERATED");
\`)));
self.import("deps.ts");
`);
  await rakefile(`file({ "deps.ts": "regenerate" });\nconsole.log("INITIAL");\n`, "deps.ts");
}

export function rakefileMultidesc(): Promise<void> {
  return rakefile(`
task("b");
desc("A");
task("a");
desc("B");
task("b");
desc("A2");
task("a");
task("c");
desc("${"x".repeat(80)}");
task("d");
`);
}

export function rakefileNamespace(): Promise<void> {
  return rakefile(`
desc("copy");
task("copy", block(() => console.log("COPY")));
namespace("nest", () => {
  desc("nest copy");
  task("copy", block(() => console.log("NEST COPY")));
  task({ xx: "copy" });
});
const anonNs = namespace(null, () => {
  desc("anonymous copy task");
  task("copy", block(() => console.log("ANON COPY")));
});
desc("Top level task to run the anonymous version of copy");
task({ anon: anonNs.get("copy") });
namespace("very", () => {
  namespace("nested", () => {
    task({ run: "rake:copy" });
  });
});
namespace("a", () => {
  desc("Run task in the 'a' namespace");
  task("run", block(() => console.log("IN A")));
});
namespace("b", () => {
  desc("Run task in the 'b' namespace");
  task({ run: "a:run" }, block(() => console.log("IN B")));
});
namespace("file1", () => {
  file("xyz.rb", block(() => console.log("XYZ1")));
});
namespace("file2", () => {
  file("xyz.rb", block(() => console.log("XYZ2")));
});
namespace("scopedep", () => {
  task("prepare", block(async () => {
    await self.touch("scopedep.rb");
    console.log("PREPARE");
  }));
  file({ "scopedep.rb": ["prepare"] }, block(() => console.log("SCOPEDEP")));
});
`);
}

export function rakefileNosearch(): Promise<void> {
  return FileUtils.touchAsync("dummy");
}

export async function rakefileRakelib(): Promise<void> {
  await FileUtils.mkdirPAsync("rakelib");
  await rakefile(`task("default", block(() => console.log("TEST1")));\n`, "rakelib/test1.ts");
  await rakefile(`task("default", block(() => console.log("TEST2")));\n`, "rakelib/test2.ts");
}

export function rakefileRbext(): Promise<void> {
  return rakefile(`task("default", block(() => console.log("OK")));\n`, "rakefile.ts");
}

export function rakefileVerbose(): Promise<void> {
  const sh = `self.sh("${RUBY} -e '0'"`;
  return rakefile(`
task("standalone_verbose_true", block(async () => {
  self.verbose(true);
  await ${sh});
}));
task("standalone_verbose_false", block(async () => {
  self.verbose(false);
  await ${sh});
}));
task("inline_verbose_default", block(() => ${sh})));
task("inline_verbose_false", block(() => ${sh}, { verbose: false })));
task("inline_verbose_true", block(() => ${sh}, { verbose: true })));
task("block_verbose_true", block(() => self.verbose(true, () => ${sh}))));
task("block_verbose_false", block(() => self.verbose(false, () => ${sh}))));
`);
}

export async function rakefileStandAloneFilelist(): Promise<void> {
  await File.writeAsync(
    "stand_alone_filelist.ts",
    `import { FileList } from "@blazetrails/rake/file-list";
const FL = await FileList.glob("*.ts");
console.log(FL.join("\\n"));
`,
  );
}
