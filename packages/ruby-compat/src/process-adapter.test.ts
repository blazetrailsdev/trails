import { afterEach, describe, expect, it, vi } from "vitest";
import { Errno, SystemCallError } from "./errno.js";
import { TypeError } from "./type-error.js";
import { RUBY_PLATFORM } from "./ruby-platform.js";
import {
  __INTERNAL_resetProcessAdapter_TEST_ONLY,
  argv,
  env,
  getProcessAdapter,
  onSignal,
  processAdapterConfig,
  registerProcessAdapter,
  setEnv,
  setExitCode,
  stderr,
  stdin,
  stdout,
  abort,
  SystemExit,
  type ProcessAdapter,
  type WriteStream,
} from "./process-adapter.js";

const moduleLoadArgv: readonly string[] = [...argv];
const moduleLoadEnv: Record<string, string | undefined> = { ...env };

function makeFakeStream(): WriteStream & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    write: (chunk) => {
      written.push(chunk);
      return true;
    },
    isTTY: false,
    columns: 80,
    rows: 24,
  };
}

function makeFakeAdapter(overrides: Partial<ProcessAdapter> = {}): ProcessAdapter {
  const stdoutStream = makeFakeStream();
  const stderrStream = makeFakeStream();
  let exitCode = 0;
  const innerEnv: Record<string, string | undefined> = {
    FAKE_FLAG: "1",
    NODE_ENV: "test",
  };
  const innerArgv = ["fake-node", "fake-script"];
  return {
    envSnapshot: () => ({ ...innerEnv }),
    argvSnapshot: () => [...innerArgv],
    cwd: () => "/fake/cwd",
    chdir: () => {},
    platform: () => "browser",
    pid: () => 4242,
    setEnv: (key, value) => {
      if (value === undefined) delete innerEnv[key];
      else innerEnv[key] = value;
    },
    exit: () => {
      throw new Error("fake exit");
    },
    setExitCode: (code) => {
      exitCode = code;
    },
    onSignal: () => () => {},
    stdout: stdoutStream,
    stderr: stderrStream,
    stdin: {
      isTTY: false,
      read: () => Promise.resolve(null),
    },
    ...(overrides as object),
    // @ts-expect-error test-only
    __exitCode: () => exitCode,
  };
}

describe("processAdapter", () => {
  afterEach(() => {
    __INTERNAL_resetProcessAdapter_TEST_ONLY();
  });

  describe("env snapshot", () => {
    it("populates env from the registered adapter", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(env.FAKE_FLAG).toBe("1");
      expect(env.NODE_ENV).toBe("test");
    });

    it("clears prior keys when re-registering", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(env.FAKE_FLAG).toBe("1");
      const adapter2 = makeFakeAdapter();
      adapter2.envSnapshot = () => ({ OTHER: "yes" });
      registerProcessAdapter(adapter2);
      expect(env.FAKE_FLAG).toBeUndefined();
      expect(env.OTHER).toBe("yes");
    });

    it("supports `in` operator", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect("FAKE_FLAG" in env).toBe(true);
      expect("NOT_SET" in env).toBe(false);
    });
  });

  describe("argv snapshot", () => {
    it("populates argv from the registered adapter", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(argv).toEqual(["fake-node", "fake-script"]);
    });

    it("array indexing works", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(argv[0]).toBe("fake-node");
      expect(argv[1]).toBe("fake-script");
      expect(argv.length).toBe(2);
    });
  });

  describe("setEnv", () => {
    it("mutates the env export and the underlying adapter", () => {
      registerProcessAdapter(makeFakeAdapter());
      setEnv("NEW_KEY", "new-value");
      expect(env.NEW_KEY).toBe("new-value");
      expect(getProcessAdapter().envSnapshot().NEW_KEY).toBe("new-value");
    });

    it("undefined value deletes the key", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(env.FAKE_FLAG).toBe("1");
      setEnv("FAKE_FLAG", undefined);
      expect(env.FAKE_FLAG).toBeUndefined();
      expect("FAKE_FLAG" in env).toBe(false);
    });
  });

  describe("delegated reads", () => {
    it("platform returns the adapter's platform", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(RUBY_PLATFORM()).toBe("browser");
    });
  });

  describe("streams", () => {
    it("stdout.write delegates to the adapter", () => {
      const adapter = makeFakeAdapter();
      registerProcessAdapter(adapter);
      stdout.write("hello");
      expect((adapter.stdout as WriteStream & { written: string[] }).written).toEqual(["hello"]);
    });

    it("stderr.write delegates to the adapter", () => {
      const adapter = makeFakeAdapter();
      registerProcessAdapter(adapter);
      stderr.write("err");
      expect((adapter.stderr as WriteStream & { written: string[] }).written).toEqual(["err"]);
    });

    it("isTTY/columns/rows delegate at access time", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(stdout.isTTY).toBe(false);
      expect(stdout.columns).toBe(80);
      expect(stdout.rows).toBe(24);
    });

    it("stdin.read() delegates to the adapter and resolves with the adapter's value", async () => {
      const adapter = makeFakeAdapter();
      const fakeStdin = {
        isTTY: true,
        read: () => Promise.resolve("hello from stdin"),
      };
      Object.defineProperty(adapter, "stdin", { value: fakeStdin, configurable: true });
      registerProcessAdapter(adapter);
      expect(stdin.isTTY).toBe(true);
      await expect(stdin.read()).resolves.toBe("hello from stdin");
    });

    it("stdin.read() propagates rejection from the adapter", async () => {
      const adapter = makeFakeAdapter();
      Object.defineProperty(adapter, "stdin", {
        value: {
          isTTY: false,
          read: () => Promise.reject(new Error("stdin boom")),
        },
        configurable: true,
      });
      registerProcessAdapter(adapter);
      await expect(stdin.read()).rejects.toThrow(/stdin boom/);
    });
  });

  describe("stdin.gets / stdin.noecho", () => {
    function registerFakeStdin(chunks: (string | null)[], isTTY = false, restores = true) {
      const modes: string[] = [];
      let mode = "echo";
      const adapter = makeFakeAdapter();
      const tty = (): void => {
        if (!isTTY) throw new Errno.ENOTTY();
      };
      Object.defineProperty(adapter, "stdin", {
        value: {
          isTTY,
          getattr: () => {
            tty();
            return mode;
          },
          setattr: (t: string) => {
            if (!restores) throw new SystemCallError("Input/output error");
            mode = t;
            modes.push(t);
          },
          setNoecho: () => {
            tty();
            mode = "-echo";
            modes.push(mode);
          },
          read: () => Promise.resolve(chunks.length > 0 ? chunks.shift()! : null),
        },
        configurable: true,
      });
      registerProcessAdapter(adapter);
      return modes;
    }

    it("gets answers each line with its newline and keeps the rest for the next call", async () => {
      registerFakeStdin(["yes\nno", "\nmaybe\n"]);
      await expect(stdin.gets()).resolves.toBe("yes\n");
      await expect(stdin.gets()).resolves.toBe("no\n");
      await expect(stdin.gets()).resolves.toBe("maybe\n");
    });

    it("gets answers an unterminated last line, then null at EOF", async () => {
      registerFakeStdin(["last"]);
      await expect(stdin.gets()).resolves.toBe("last");
      await expect(stdin.gets()).resolves.toBeNull();
    });

    it("gets answers an empty line as a newline, distinct from null at EOF", async () => {
      registerFakeStdin(["\n"]);
      await expect(stdin.gets()).resolves.toBe("\n");
      await expect(stdin.gets()).resolves.toBeNull();
    });

    it("gets with chomp drops the separator and a CR before a newline", async () => {
      registerFakeStdin(["a\r\nb\n"]);
      await expect(stdin.gets({ chomp: true })).resolves.toBe("a");
      await expect(stdin.gets({ chomp: true })).resolves.toBe("b");
    });

    it("gets in paragraph mode swallows the newlines around each paragraph", async () => {
      registerFakeStdin(["\n\npara1\nx\n", "\n\npara2\n"]);
      await expect(stdin.gets("")).resolves.toBe("para1\nx\n\n");
      await expect(stdin.gets("")).resolves.toBe("para2\n");
      await expect(stdin.gets("")).resolves.toBeNull();
    });

    it("gets takes a lone Integer as a byte limit that never splits a character", async () => {
      registerFakeStdin(["abcdef\n"]);
      await expect(stdin.gets(3)).resolves.toBe("abc");
      await expect(stdin.gets(0)).resolves.toBe("");
      await expect(stdin.gets("e", 10)).resolves.toBe("de");
      await expect(stdin.gets(null)).resolves.toBe("f\n");
      registerFakeStdin(["héllo\n"]);
      await expect(stdin.gets(2)).resolves.toBe("hé");
    });

    it("gets with a custom separator and with nil", async () => {
      registerFakeStdin(["abXY", "cd"]);
      await expect(stdin.gets("XY", { chomp: true })).resolves.toBe("ab");
      await expect(stdin.gets(null, { chomp: true })).resolves.toBe("cd");
      await expect(stdin.gets(null)).resolves.toBeNull();
    });

    it("gets advances lineno for each line not cut by the limit", async () => {
      registerFakeStdin(["ab\ncd\n"]);
      const start = stdin.lineno;
      await stdin.gets(1);
      await stdin.gets();
      await stdin.gets();
      await stdin.gets();
      expect(stdin.lineno - start).toBe(2);
    });

    it("gets converts its limit and separator as Ruby does", async () => {
      registerFakeStdin(["abc\n"]);
      await expect(stdin.gets(true as never)).rejects.toThrow(
        new TypeError("no implicit conversion of true into Integer"),
      );
      await expect(stdin.gets(NaN)).rejects.toThrow("float NaN out of range of integer");
      await expect(stdin.gets(1 as never, 2)).rejects.toThrow(
        new TypeError("no implicit conversion of Integer into String"),
      );
      await expect(stdin.gets(1.9)).resolves.toBe("a");
    });

    it("read answers what gets buffered past a line first", async () => {
      registerFakeStdin(["a\nb"]);
      await stdin.gets();
      await expect(stdin.read()).resolves.toBe("b");
    });

    it("noecho turns only echo off for an async block and restores it after it settles", async () => {
      const modes = registerFakeStdin(["secret\n"], true);
      const answer = stdin.noecho((io) => io.gets());
      expect(modes).toEqual(["-echo"]);
      await expect(answer).resolves.toBe("secret\n");
      expect(modes).toEqual(["-echo", "echo"]);
    });

    it("noecho restores the saved mode when the block rejects", async () => {
      const modes = registerFakeStdin([], true);
      await expect(
        stdin.noecho(async () => {
          await Promise.resolve();
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(modes).toEqual(["-echo", "echo"]);
    });

    it("noecho raises when the saved mode cannot be restored, after the block completes", async () => {
      registerFakeStdin(["x\n"], true, false);
      await expect(stdin.noecho((io) => io.gets())).rejects.toThrow(
        new SystemCallError("Input/output error"),
      );
    });

    it("noecho raises ENOTTY off a terminal", () => {
      registerFakeStdin([], false);
      let error: unknown;
      try {
        stdin.noecho(() => null);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Errno.ENOTTY);
      expect(error).toBeInstanceOf(SystemCallError);
      expect(error).toMatchObject({ message: "Inappropriate ioctl for device", errno: 25 });
    });
  });

  describe("setExitCode", () => {
    it("forwards to the adapter", () => {
      const adapter = makeFakeAdapter();
      registerProcessAdapter(adapter);
      setExitCode(2);
      expect((adapter as unknown as { __exitCode: () => number }).__exitCode()).toBe(2);
    });
  });

  describe("onSignal", () => {
    it("returns the adapter's unsubscribe function", () => {
      const unsub = vi.fn();
      const adapter = makeFakeAdapter({ onSignal: () => unsub });
      registerProcessAdapter(adapter);
      const off = onSignal("SIGINT", () => {});
      off();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe("auto-register node", () => {
    it("auto-registers when running in node and no adapter is set", () => {
      __INTERNAL_resetProcessAdapter_TEST_ONLY();
      expect(typeof getProcessAdapter().cwd()).toBe("string");
      expect(argv.length).toBeGreaterThan(0);
    });

    it("env/argv are populated on direct read without a prior function call", () => {
      expect(moduleLoadArgv.length).toBeGreaterThan(0);
      const procEnv = (globalThis as { process: { env: Record<string, string | undefined> } })
        .process.env;
      expect(Object.keys(moduleLoadEnv).sort()).toEqual(Object.keys(procEnv).sort());
    });
  });

  describe("atomic registration", () => {
    it("leaves prior state intact if envSnapshot throws", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(env.FAKE_FLAG).toBe("1");
      const broken = makeFakeAdapter();
      broken.envSnapshot = () => {
        throw new Error("snapshot boom");
      };
      expect(() => registerProcessAdapter(broken)).toThrow(/snapshot boom/);
      expect(env.FAKE_FLAG).toBe("1");
      expect(getProcessAdapter()).not.toBe(broken);
    });

    it("leaves prior state intact if argvSnapshot throws", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(argv).toEqual(["fake-node", "fake-script"]);
      const broken = makeFakeAdapter();
      broken.argvSnapshot = () => {
        throw new Error("argv boom");
      };
      expect(() => registerProcessAdapter(broken)).toThrow(/argv boom/);
      expect(env.FAKE_FLAG).toBe("1");
      expect(argv).toEqual(["fake-node", "fake-script"]);
      expect(getProcessAdapter()).not.toBe(broken);
    });
  });

  describe("processAdapterConfig", () => {
    it("reports null when no adapter is registered", () => {
      __INTERNAL_resetProcessAdapter_TEST_ONLY();
      expect(processAdapterConfig.adapter).toBeNull();
    });

    it("reports 'node' when the auto-registered Node adapter is active", () => {
      __INTERNAL_resetProcessAdapter_TEST_ONLY();
      getProcessAdapter();
      expect(processAdapterConfig.adapter).toBe("node");
    });

    it("reports 'custom' when a user adapter is registered", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(processAdapterConfig.adapter).toBe("custom");
    });
  });

  describe("abort", () => {
    it("writes the message to stderr, sets exit status 1 and raises SystemExit", () => {
      const adapter = makeFakeAdapter();
      registerProcessAdapter(adapter);

      expect(() => abort("Schema migrations table does not exist yet.")).toThrow(SystemExit);
      expect((adapter.stderr as unknown as { written: string[] }).written).toEqual([
        "Schema migrations table does not exist yet.\n",
      ]);
      expect((adapter as unknown as { __exitCode: () => number }).__exitCode()).toBe(1);
    });

    it('raises SystemExit with Ruby\'s "exit" message and writes nothing when given none', () => {
      const adapter = makeFakeAdapter();
      registerProcessAdapter(adapter);

      let raised: SystemExit | undefined;
      try {
        abort();
      } catch (e) {
        raised = e as SystemExit;
      }
      expect(raised).toBeInstanceOf(SystemExit);
      expect(raised.message).toBe("exit");
      expect(raised.status).toBe(1);
      expect((adapter.stderr as unknown as { written: string[] }).written).toEqual([]);
    });
  });

  describe("missing adapter", () => {
    it("throws a helpful error when no adapter is configured and node is unavailable", () => {
      __INTERNAL_resetProcessAdapter_TEST_ONLY();
      const originalProcessDescriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
      Object.defineProperty(globalThis, "process", { value: undefined, configurable: true });
      try {
        expect(() => getProcessAdapter()).toThrow(/No process adapter configured/);
      } finally {
        if (originalProcessDescriptor) {
          Object.defineProperty(globalThis, "process", originalProcessDescriptor);
        } else {
          delete (globalThis as { process?: unknown }).process;
        }
      }
    });
  });
});
