import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __INTERNAL_resetProcessAdapter_TEST_ONLY,
  argv,
  cwd,
  env,
  getProcessAdapter,
  onSignal,
  platform,
  processAdapterConfig,
  registerProcessAdapter,
  setEnv,
  setExitCode,
  stderr,
  stdin,
  stdout,
  type ProcessAdapter,
  type WriteStream,
} from "./process-adapter.js";

// Capture the eager module-load auto-register snapshot before any test
// runs `__INTERNAL_resetProcessAdapter_TEST_ONLY()`. Used to regression-test that direct
// `env.FOO` / `argv[0]` reads see populated values without any prior
// function call going through the adapter.
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
    // exposed via getProcessAdapter for assertion purposes
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
    it("cwd returns the adapter's cwd", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(cwd()).toBe("/fake/cwd");
    });

    it("platform returns the adapter's platform", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(platform()).toBe("browser");
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
      // Override stdin to return a known value.
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
      // First access triggers auto-register; cwd() should not throw.
      expect(typeof cwd()).toBe("string");
      // Node's process.argv has at least the executable.
      expect(argv.length).toBeGreaterThan(0);
    });

    it("env/argv are populated on direct read without a prior function call", () => {
      // Regression: reading env.FOO or argv[0] directly used to return
      // empty snapshots because auto-register only fired through
      // requireAdapter(). Module load now eagerly auto-registers under
      // Node so direct reads work.
      //
      // Assert structural alignment with process.env keys rather than
      // hard-coding PATH so this passes in hermetic envs where PATH
      // may be unset.
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
      // Prior adapter's snapshot must still be present.
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
      // env should not have been wiped (argv runs before mutation).
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
      // Trigger auto-register.
      cwd();
      expect(processAdapterConfig.adapter).toBe("node");
    });

    it("reports 'custom' when a user adapter is registered", () => {
      registerProcessAdapter(makeFakeAdapter());
      expect(processAdapterConfig.adapter).toBe("custom");
    });
  });

  describe("missing adapter", () => {
    it("throws a helpful error when no adapter is configured and node is unavailable", () => {
      __INTERNAL_resetProcessAdapter_TEST_ONLY();
      // Save the full property descriptor so we restore writability/
      // configurability/getter semantics — not just the value.
      const originalProcessDescriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
      Object.defineProperty(globalThis, "process", { value: undefined, configurable: true });
      try {
        expect(() => cwd()).toThrow(/No process adapter configured/);
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
