import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dir,
  File,
  FileUtils as StdlibFileUtils,
  IO,
  ArgumentError,
  LoadError,
  NotImplementedError,
  STDERR,
  STDOUT,
  StandardError,
  Tempfile,
  block,
  env as ENV,
  getFs,
  include,
  rbEnsure,
  rbObjDup,
  setEnv,
  stderr as $stderr,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { FileUtils, FileUtilsExt as Ext } from "./rake.js";

const FileUtilsExt = Ext as typeof Ext & typeof FileUtils;

const verbose = FileUtilsExt.verbose.bind(FileUtilsExt);
const nowrite = FileUtilsExt.nowrite.bind(FileUtilsExt);
const sh = FileUtilsExt.sh.bind(FileUtilsExt);
const ruby = FileUtilsExt.ruby.bind(FileUtilsExt);
const rmRf = FileUtilsExt.rmRf.bind(FileUtilsExt);

async function isExist(name: string): Promise<boolean> {
  return (await getFs().stat!(name).catch(() => null)) != null;
}

async function createFile(name: string): Promise<void> {
  await getFs().writeFile!(name, "");
}

async function command(name: string, text: string): Promise<void> {
  await getFs().writeFile!(name, text, { mode: 0o750 });
}

async function captureSubprocessIo(block: () => unknown): Promise<[string, string]> {
  const capturedStdout = Tempfile.new("out");
  const capturedStderr = Tempfile.new("err");

  const origStdout = rbObjDup(STDOUT);
  const origStderr = rbObjDup(STDERR);
  try {
    STDOUT.reopen(capturedStdout);
    STDERR.reopen(capturedStderr);

    await block();

    STDOUT.rewind();
    STDERR.rewind();

    return [capturedStdout.read() as string, capturedStderr.read() as string];
  } finally {
    STDOUT.reopen(origStdout);
    STDERR.reopen(origStderr);

    origStdout.close();
    origStderr.close();
    capturedStdout.closeBang();
    capturedStderr.closeBang();
  }
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
    expect(await isExist("a")).toBeFalsy();
  });

  it("rm two files", async () => {
    await createFile("a");
    await createFile("b");
    await StdlibFileUtils.rmRfAsync(["a", "b"]);
    expect(await isExist("a")).toBeFalsy();
    expect(await isExist("b")).toBeFalsy();
  });

  // PERMANENT-SKIP: `Rake::FileList` is a non-goal of RFC 0211 (README § "Non-goals", `file_list.rb`).
  it.skip("rm filelist", () => {});

  it("rm nowrite", async () => {
    await createFile("a");
    await nowrite(true, () => rmRf("a"));
    expect(await isExist("a")).toBeTruthy();
    await nowrite(false, () => rmRf("a", { noop: true }));
    expect(await isExist("a")).toBeTruthy();
    await nowrite(true, () => rmRf("a", { noop: false }));
    expect(await isExist("a")).toBeFalsy();
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

    expect(await isExist("a")).toBeFalsy();
  });

  it("fileutils methods dont leak", () => {
    const obj = {} as Record<string, () => unknown>;
    expect(() => obj.copy()).toThrow(TypeError);
    expect(() => obj.ruby()).toThrow(TypeError);
  });

  it("sh", async () => {
    await shellcommand();

    await verbose(false, () => sh(`${RUBY} shellcommand.rb`));
    expect(true).toBeTruthy();
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

    const [r, w] = IO.pipe();

    await verbose(false, () => sh(RUBY, "echocommand.rb", { out: w }));

    w.close();

    expect(new TextDecoder().decode(r.read() as Uint8Array)).toBe("echocommand.rb\n");
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
          expect(ok).toBeTruthy();
          expect(res.exitstatus()).toBe(0);
          count += 1;
        }),
      );
      await sh(
        `${RUBY} shellcommand.rb 1`,
        block((ok: unknown, res: { exitstatus(): number }) => {
          expect(!ok).toBeTruthy();
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
    expect(true).toBeTruthy();
  });

  it("sh bad option", async () => {
    await shellcommand();

    const ex = (await (
      verbose(false, () => sh("shellcommand.rb", { badOption: true })) as Promise<unknown>
    ).catch((e: Error) => e)) as Error;
    expect(() => {
      throw ex;
    }).toThrow(ArgumentError);
    expect(ex.message).toMatch(/badOption/);
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
    expect(out).toBeEmpty();
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
      const actualBoth = await captureSubprocessIo(() =>
        sh(shellCommand).then(
          () => expect.fail(),
          () => {},
        ),
      );
      const actual = actualBoth.join("");
      expect(actual).toMatch(standardOutput);
      expect(actual).toMatch(standardError);
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
      const ex = (await sh(shellCommand).catch((e: Error) => e)) as Error;
      expect(ex).not.toBeNull();
      expect(ex.message).toContain("Command failed with status");
      expect(ex.message).toContain(shellCommand);
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
      "const [a, b] = process.argv.slice(2); process.exit(a != b ? 0 : 1);\n",
    );
  }

  function checkEnvironment(): Promise<void> {
    return command(
      "check_environment.rb",
      "const [a, b] = process.argv.slice(2); process.exit(process.env[a] != b ? 1 : 0);\n",
    );
  }

  function checkExpansion(): Promise<void> {
    return command(
      "check_expansion.rb",
      "const [a, b] = process.argv.slice(2); process.exit(a != b ? 1 : 0);\n",
    );
  }

  function echocommand(): Promise<void> {
    return command("echocommand.rb", 'console.log("echocommand.rb");\n');
  }

  function replaceRuby<T>(block: () => T): T {
    const ruby = FileUtils.RUBY;
    FileUtils.RUBY = RUBY;
    return rbEnsure(block, () => {
      FileUtils.RUBY = ruby;
    });
  }

  function shellcommand(): Promise<void> {
    return command("shellcommand.rb", 'process.exit(Number(process.argv[2] || "0"));\n');
  }

  function envVar(): string {
    return isWindows() ? "%RAKE_TEST_SH%" : "$RAKE_TEST_SH";
  }

  function isWindows(): boolean {
    return File.ALT_SEPARATOR != null;
  }
});
