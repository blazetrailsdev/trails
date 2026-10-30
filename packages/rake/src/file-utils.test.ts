import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dir,
  File,
  FileUtils as StdlibFileUtils,
  LoadError,
  RuntimeError,
  NotImplementedError,
  StandardError,
  block,
  env as ENV,
  getFs,
  include,
  rbEnsure,
  setEnv,
  stderr as $stderr,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { FileUtils, FileUtilsExt } from "./rake.js";

const { verbose, nowrite, sh, ruby, rmRf } = {
  verbose: (...args: unknown[]) => FileUtilsExt.verbose(...args),
  nowrite: (...args: unknown[]) => FileUtilsExt.nowrite(...args),
  sh: (...args: unknown[]) => FileUtilsExt.sh(...args),
  ruby: (...args: unknown[]) => FileUtilsExt.ruby(...args),
  rmRf: (...args: [string | string[], { noop?: boolean }?]) => FileUtilsExt.rmRf(...args),
};

async function isExist(name: string): Promise<boolean> {
  return (await getFs().stat!(name).catch(() => null)) != null;
}

async function createFile(name: string): Promise<void> {
  await getFs().writeFile!(name, "");
}

async function command(name: string, text: string): Promise<void> {
  await getFs().writeFile!(name, text, { mode: 0o750 });
}

async function captureOutput(block: () => unknown): Promise<[string, string]> {
  const out = { stdout: "", stderr: "" };
  const writes = [$stdout.write, $stderr.write];
  $stdout.write = (chunk: string) => ((out.stdout += chunk), true);
  $stderr.write = (chunk: string) => ((out.stderr += chunk), true);
  return rbEnsure(
    async () => {
      await block();
      return [out.stdout, out.stderr] as [string, string];
    },
    () => {
      [$stdout.write, $stderr.write] = writes;
    },
  );
}

const RUBY = FileUtils.RUBY;

describe("TestRakeFileUtils", () => {
  let origPwd: string;
  let tempdir: string;
  let rakeTestSh: string | undefined;

  beforeEach(async () => {
    origPwd = Dir.pwd();
    tempdir = Dir.mktmpdir("test_rake_");
    Dir.chdir(tempdir);
    FileUtilsExt.verboseFlag = false;
    rakeTestSh = ENV["RAKE_TEST_SH"];
  });

  afterEach(async () => {
    FileUtils.LN_SUPPORTED[0] = true;
    FileUtilsExt.verboseFlag = FileUtilsExt.DEFAULT;
    setEnv("RAKE_TEST_SH", rakeTestSh);
    Dir.chdir(origPwd);
    await StdlibFileUtils.rmRfAsync(tempdir);
  });

  it("rm one file", async () => {
    await createFile("a");
    await StdlibFileUtils.rmRfAsync("a");
    expect(await isExist("a")).toBe(false);
  });

  it("rm two files", async () => {
    await createFile("a");
    await createFile("b");
    await StdlibFileUtils.rmRfAsync(["a", "b"]);
    expect(await isExist("a")).toBe(false);
    expect(await isExist("b")).toBe(false);
  });

  // PERMANENT-SKIP: `Rake::FileList` is a non-goal of RFC 0211 (README § "Non-goals", `file_list.rb`).
  it.skip("rm filelist", () => {});

  it("rm nowrite", async () => {
    await createFile("a");
    await nowrite(true, () => rmRf("a"));
    expect(await isExist("a")).toBe(true);
    await nowrite(false, () => rmRf("a", { noop: true }));
    expect(await isExist("a")).toBe(true);
    await nowrite(true, () => rmRf("a", { noop: false }));
    expect(await isExist("a")).toBe(false);
  });

  it("ln", async () => {
    await getFs().writeFile!("a", "TEST_LN\n");

    await FileUtilsExt.safeLn("a", "b", { verbose: false });

    expect(await getFs().readFile("b", "utf-8")).toBe("TEST_LN\n");
  });

  class BadLink {
    declare safeLn: typeof FileUtilsExt.safeLn;
    cpArgs: unknown[] | null = null;
    #failureClass: new (message: string) => Error;

    constructor(klass: new (message: string) => Error) {
      this.#failureClass = klass;
    }

    async cp(...args: unknown[]): Promise<void> {
      this.cpArgs = args;
    }

    async ln(..._args: unknown[]): Promise<void> {
      throw new this.#failureClass("ln not supported");
    }
  }
  include(BadLink, FileUtilsExt);

  it("safe ln failover to cp on standard error", async () => {
    FileUtils.LN_SUPPORTED[0] = true;
    const c = new BadLink(StandardError);
    await c.safeLn("a", "b");
    expect(c.cpArgs).toEqual(["a", "b"]);
    await c.safeLn("x", "y");
    expect(c.cpArgs).toEqual(["x", "y"]);
  });

  it("safe ln failover to cp on not implemented error", async () => {
    FileUtils.LN_SUPPORTED[0] = true;
    const c = new BadLink(NotImplementedError);
    await c.safeLn("a", "b");
    expect(c.cpArgs).toEqual(["a", "b"]);
  });

  it("safe ln fails on script error", async () => {
    FileUtils.LN_SUPPORTED[0] = true;
    const c = new BadLink(LoadError);
    await expect(c.safeLn("a", "b")).rejects.toThrow(LoadError);
  });

  it("verbose", () => {
    verbose(true);
    expect(verbose()).toBe(true);
    verbose(false);
    expect(verbose()).toBe(false);
    verbose(true, () => {
      expect(verbose()).toBe(true);
    });
    expect(verbose()).toBe(false);
  });

  it("nowrite", () => {
    nowrite(true);
    expect(nowrite()).toBe(true);
    nowrite(false);
    expect(nowrite()).toBe(false);
    nowrite(true, () => {
      expect(nowrite()).toBe(true);
    });
    expect(nowrite()).toBe(false);
  });

  it("file utils methods are available at top level", async () => {
    await createFile("a");

    await captureOutput(() => rmRf("a"));

    expect(await isExist("a")).toBe(false);
  });

  it("fileutils methods dont leak", () => {
    const obj = {} as Record<string, () => unknown>;
    expect(() => obj.copy()).toThrow(TypeError);
    expect(() => obj.ruby()).toThrow(TypeError);
  });

  it("sh", async () => {
    await shellcommand();

    await verbose(false, () => sh(`${RUBY} shellcommand.rb`));
  });

  it("sh with a single string argument", async () => {
    await checkExpansion();

    setEnv("RAKE_TEST_SH", "someval");
    await verbose(false, () => sh(`${RUBY} check_expansion.rb ${envVar()} someval`));
  });

  it("sh with env", async () => {
    await checkEnvironment();

    const env = {
      RAKE_TEST_SH: "someval",
    };

    await verbose(false, () => sh(env, RUBY, "check_environment.rb", "RAKE_TEST_SH", "someval"));
  });

  it("sh with multiple arguments", async () => {
    await checkNoExpansion();
    setEnv("RAKE_TEST_SH", "someval");

    await verbose(false, () => sh(RUBY, "check_no_expansion.rb", envVar(), "someval"));
  });

  it("sh with spawn options", async () => {
    await echocommand();

    await verbose(false, () => sh(RUBY, "echocommand.rb", { out: "echocommand.out" }));

    expect(await getFs().readFile("echocommand.out", "utf-8")).toBe("echocommand.rb\n");
  });

  it("sh with hash option", async () => {
    await checkExpansion();

    await verbose(false, () =>
      sh(`${RUBY} check_expansion.rb`, { chdir: "." }, { verbose: false }),
    );
  });

  it("sh failure", async () => {
    await shellcommand();

    await expect(verbose(false, () => sh(`${RUBY} shellcommand.rb 1`))).rejects.toThrow(
      "Command failed with status (1)",
    );
  });

  it("sh special handling", async () => {
    await shellcommand();

    let count = 0;
    await verbose(false, async () => {
      await sh(
        `${RUBY} shellcommand.rb`,
        block((ok: unknown, res: { exitstatus(): number }) => {
          expect(ok).toBe(true);
          expect(res.exitstatus()).toBe(0);
          count += 1;
        }),
      );
      await sh(
        `${RUBY} shellcommand.rb 1`,
        block((ok: unknown, res: { exitstatus(): number }) => {
          expect(ok).toBe(false);
          expect(res.exitstatus()).toBe(1);
          count += 1;
        }),
      );
    });
    expect(count).toBe(2);
  });

  it("sh noop", async () => {
    await shellcommand();

    await verbose(false, () => sh("shellcommand.rb 1", { noop: true }));
  });

  it("sh bad option", async () => {
    await shellcommand();

    await expect(verbose(false, () => sh("shellcommand.rb", { badOption: true }))).rejects.toThrow(
      /badOption/,
    );
  });

  it("sh verbose", async () => {
    await shellcommand();

    const [, err] = await captureOutput(() =>
      verbose(true, () => sh("shellcommand.rb", { noop: true })),
    );

    expect(err).toBe("shellcommand.rb\n");
  });

  it("sh verbose false", async () => {
    await shellcommand();

    const [, err] = await captureOutput(() =>
      verbose(false, () => sh("shellcommand.rb", { noop: true })),
    );

    expect(err).toBe("");
  });

  it("sh verbose flag nil", async () => {
    await shellcommand();

    FileUtilsExt.verboseFlag = null;

    const [out] = await captureOutput(() => sh("shellcommand.rb", { noop: true }));
    expect(out).toBe("");
  });

  it("ruby with a single string argument", async () => {
    await checkExpansion();

    setEnv("RAKE_TEST_SH", "someval");

    await verbose(false, () => replaceRuby(() => ruby(`check_expansion.rb ${envVar()} someval`)));
  });

  it("sh show command", () => {
    const env = {
      RAKE_TEST_SH: "someval",
    };

    const cmd = [env, RUBY, "some_file.rb", "some argument"];

    const showCmd = FileUtilsExt.shShowCommand(cmd);

    const expectedCmd = `RAKE_TEST_SH=someval ${RUBY} some_file.rb some argument`;

    expect(showCmd).toBe(expectedCmd);
  });

  it("sh if a command exits with error status its full output is printed", async () => {
    await verbose(false, async () => {
      const standardOutput = "Some output";
      const standardError = "Some error";
      const shellCommand = `${RUBY} -e "console.log('${standardOutput}');console.error('${standardError}');process.exitCode = 1"`;
      await expect(sh(shellCommand)).rejects.toThrow(RuntimeError);
    });
  });

  it("sh if a command exits with error status sh echoes it fully", async () => {
    await verbose(true, () => assertEchoesFully());
    await verbose(false, () => assertEchoesFully());
  });

  async function assertEchoesFully(): Promise<void> {
    const longString = "1234567890".repeat(10);
    const shellCommand = `${RUBY} -e "'${longString}';process.exitCode = 1"`;
    await captureOutput(async () => {
      const ex = await sh(shellCommand).then(
        () => null,
        (e: Error) => e,
      );
      expect(ex).not.toBeNull();
      expect(ex!.message).toContain("Command failed with status");
      expect(ex!.message).toContain(shellCommand);
    });
  }

  it("ruby with multiple arguments", async () => {
    await checkNoExpansion();

    setEnv("RAKE_TEST_SH", "someval");
    await verbose(false, () =>
      replaceRuby(() => ruby("check_no_expansion.rb", envVar(), "someval")),
    );
  });

  it("split all", () => {
    expect(FileUtilsExt.splitAll("a")).toEqual(["a"]);
    expect(FileUtilsExt.splitAll("..")).toEqual([".."]);
    expect(FileUtilsExt.splitAll("/")).toEqual(["/"]);
    expect(FileUtilsExt.splitAll("a/b")).toEqual(["a", "b"]);
    expect(FileUtilsExt.splitAll("/a/b")).toEqual(["/", "a", "b"]);
    expect(FileUtilsExt.splitAll("../a/b")).toEqual(["..", "a", "b"]);
  });

  function checkNoExpansion(): Promise<void> {
    return command(
      "check_no_expansion.rb",
      `const ARGV = process.argv.slice(2);
if (ARGV[0] != ARGV[1]) {
  process.exit(0);
} else {
  process.exit(1);
}
`,
    );
  }

  function checkEnvironment(): Promise<void> {
    return command(
      "check_environment.rb",
      `const ARGV = process.argv.slice(2);
if (process.env[ARGV[0]] != ARGV[1]) {
  process.exit(1);
} else {
  process.exit(0);
}
`,
    );
  }

  function checkExpansion(): Promise<void> {
    return command(
      "check_expansion.rb",
      `const ARGV = process.argv.slice(2);
if (ARGV[0] != ARGV[1]) {
  process.exit(1);
} else {
  process.exit(0);
}
`,
    );
  }

  function echocommand(): Promise<void> {
    return command(
      "echocommand.rb",
      `console.log("echocommand.rb");

process.exit(0);
`,
    );
  }

  function replaceRuby<T>(block: () => T): T {
    const ruby = FileUtils.RUBY;
    FileUtils.RUBY = RUBY;
    return rbEnsure(block, () => {
      FileUtils.RUBY = ruby;
    });
  }

  function shellcommand(): Promise<void> {
    return command(
      "shellcommand.rb",
      `process.exit(Number(process.argv[2] || "0"));
`,
    );
  }

  function envVar(): string {
    return isWindows() ? "%RAKE_TEST_SH%" : "$RAKE_TEST_SH";
  }

  function isWindows(): boolean {
    return File.ALT_SEPARATOR != null;
  }
});
