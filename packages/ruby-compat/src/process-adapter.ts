import { Errno } from "./errno.js";

export interface WriteStream {
  write(chunk: string): boolean;
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export interface ReadStream {
  readonly isTTY: boolean;
  read(): Promise<string | null>;
  getattr?(): string | null;
  setattr?(t: string): boolean;
  setNoecho?(): boolean;
}

export type SignalName = "SIGINT" | "SIGTERM";

export interface ProcessAdapter {
  envSnapshot(): Record<string, string | undefined>;
  argvSnapshot(): readonly string[];
  cwd(): string;
  chdir(dir: string): void;
  platform(): string;
  pid(): number;
  setEnv(key: string, value: string | undefined): void;
  exit(code?: number): never;
  setExitCode(code: number): void;
  onSignal(name: SignalName, handler: () => void): () => void;
  readonly stdout: WriteStream;
  readonly stderr: WriteStream;
  readonly stdin: ReadStream;
}

const envInternal: Record<string, string | undefined> = Object.create(null) as Record<
  string,
  string | undefined
>;
const argvInternal: string[] = [];

export const env = envInternal as Readonly<Record<string, string | undefined>>;
export const argv = argvInternal as ReadonlyArray<string>;

let currentAdapter: ProcessAdapter | null = null;

function requireAdapter(): ProcessAdapter {
  if (!currentAdapter && !tryAutoRegisterNode()) {
    throw new Error(
      "No process adapter configured. Call registerProcessAdapter() or run in a Node host.",
    );
  }
  return currentAdapter!;
}

/** @noRailsEquivalent PERMANENT */
export const stdout: WriteStream = {
  /** @noRailsEquivalent PERMANENT */
  write: (chunk) => requireAdapter().stdout.write(chunk),
  /** @noRailsEquivalent PERMANENT */
  get isTTY() {
    return requireAdapter().stdout.isTTY;
  },
  /** @noRailsEquivalent PERMANENT */
  get columns() {
    return requireAdapter().stdout.columns;
  },
  /** @noRailsEquivalent PERMANENT */
  get rows() {
    return requireAdapter().stdout.rows;
  },
};

/** @noRailsEquivalent PERMANENT */
export const stderr: WriteStream = {
  /** @noRailsEquivalent PERMANENT */
  write: (chunk) => requireAdapter().stderr.write(chunk),
  /** @noRailsEquivalent PERMANENT */
  get isTTY() {
    return requireAdapter().stderr.isTTY;
  },
  /** @noRailsEquivalent PERMANENT */
  get columns() {
    return requireAdapter().stderr.columns;
  },
  /** @noRailsEquivalent PERMANENT */
  get rows() {
    return requireAdapter().stderr.rows;
  },
};

let stdinBuffer = "";

/** @noRailsEquivalent PERMANENT */
export const stdin: ReadStream & {
  gets(): Promise<string | null>;
  noecho<T>(block: (io: typeof stdin) => T): T;
} = {
  /** @noRailsEquivalent PERMANENT */
  get isTTY() {
    return requireAdapter().stdin.isTTY;
  },
  /** @noRailsEquivalent PERMANENT */
  read: () => {
    if (stdinBuffer !== "") {
      const data = stdinBuffer;
      stdinBuffer = "";
      return Promise.resolve(data);
    }
    return requireAdapter().stdin.read();
  },
  /**
   * `IO#gets` (`vendor/ruby/v3.3.11/io.c:4363` `rb_io_gets_m`) with the default
   * `$/`: the next line with its `"\n"`, the unterminated rest at end of
   * file, then `nil`. Asynchronous, because a stdin read is. What the adapter
   * delivered past the line is kept for the next read. `rb_io_getline`'s
   * separator, limit and `chomp:` forms are not ported: Thor's bare `gets`
   * is the only call site (ruby-compat's rule 1, "only what trails actually
   * calls").
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#gets`, which Thor calls on
   * `$stdin` (`vendor/thor/v1.3.2/lib/thor/line_editor/basic.rb:25`).
   */
  async gets() {
    for (;;) {
      const newline = stdinBuffer.indexOf("\n");
      if (newline !== -1) {
        const line = stdinBuffer.slice(0, newline + 1);
        stdinBuffer = stdinBuffer.slice(newline + 1);
        return line;
      }
      const chunk = await requireAdapter().stdin.read();
      if (chunk == null) {
        if (stdinBuffer === "") return null;
        const line = stdinBuffer;
        stdinBuffer = "";
        return line;
      }
      stdinBuffer += chunk;
    }
  },
  /**
   * `IO#noecho` (`vendor/ruby/v3.3.11/ext/io/console/console.c:633`
   * `console_noecho`): `ttymode` (`console.c:334-383`) saves the terminal
   * mode with `getattr`, clears only the echo flags with `set_noecho`
   * (`console.c:283-291`), yields the IO, and `setattr`s the saved mode
   * back — after a returned promise settles, since a block that awaits a
   * read has not finished when it returns. A stream whose mode cannot be read
   * or set raises `Errno::ENOTTY`, as `ttymode`'s `rb_syserr_fail`
   * (`console.c:378`) does.
   *
   * @noRailsEquivalent PERMANENT — `io/console`'s `IO#noecho`, which Thor
   * calls on `$stdin` (`vendor/thor/v1.3.2/lib/thor/line_editor/basic.rb:29`).
   */
  noecho<T>(block: (io: typeof stdin) => T): T {
    const io = requireAdapter().stdin;
    const t = io.getattr?.() ?? null;
    if (t == null || io.setNoecho?.() !== true) throw new Errno.ENOTTY();
    const setattr = (): void => {
      io.setattr!(t);
    };
    let result: T;
    try {
      result = block(stdin);
    } catch (error) {
      setattr();
      throw error;
    }
    if (result != null && typeof (result as { then?: unknown }).then === "function") {
      return Promise.resolve(result).finally(setattr) as T;
    }
    setattr();
    return result;
  },
};

/** @noRailsEquivalent PERMANENT */
export function chdir(dir: string): void {
  requireAdapter().chdir(dir);
}

/** @noRailsEquivalent PERMANENT */
export function exit(code?: number): never {
  return requireAdapter().exit(code);
}

/** @noRailsEquivalent PERMANENT */
export function setExitCode(code: number): void {
  requireAdapter().setExitCode(code);
}

/** @noRailsEquivalent PERMANENT */
export function onSignal(name: SignalName, handler: () => void): () => void {
  return requireAdapter().onSignal(name, handler);
}

/** @noRailsEquivalent PERMANENT */
export class SystemExit extends Error {
  /** @noRailsEquivalent PERMANENT */
  readonly status: number;

  /** @noRailsEquivalent PERMANENT */
  constructor(status: number, message = "exit") {
    super(message);
    this.name = "SystemExit";
    this.status = status;
  }
}

/** @noRailsEquivalent PERMANENT */
export function abort(message?: string): never {
  if (message !== undefined) stderr.write(`${message}\n`);
  setExitCode(1);
  throw new SystemExit(1, message);
}

/** @noRailsEquivalent PERMANENT */
export function setEnv(key: string, value: string | undefined): void {
  requireAdapter().setEnv(key, value);
  if (value === undefined) {
    delete envInternal[key];
  } else {
    envInternal[key] = value;
  }
}

/** @noRailsEquivalent PERMANENT */
export function registerProcessAdapter(adapter: ProcessAdapter): void {
  const envSnapshot = adapter.envSnapshot();
  const argvSnapshot = adapter.argvSnapshot();

  currentAdapter = adapter;
  stdinBuffer = "";
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value !== undefined) envInternal[key] = value;
  }
  argvInternal.length = 0;
  argvInternal.push(...argvSnapshot);
}

/** @noRailsEquivalent PERMANENT */
export function getProcessAdapter(): ProcessAdapter {
  return requireAdapter();
}

/** @noRailsEquivalent PERMANENT */
export const processAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    if (!currentAdapter) return null;
    return currentAdapter === nodeAutoRegistered ? "node" : "custom";
  },
};

let nodeAutoRegistered: ProcessAdapter | null = null;

interface NodeStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  readableEnded?: boolean;
  destroyed?: boolean;
  pause?(): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

interface NodeProcessLike {
  versions?: { node?: string };
  env: Record<string, string | undefined>;
  argv: string[];
  cwd(): string;
  chdir(dir: string): void;
  platform: string;
  pid: number;
  exit(code?: number): never;
  exitCode: number | string | undefined;
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
  stdout: NodeStream;
  stderr: NodeStream;
  stdin: NodeStream;
  getBuiltinModule?(id: string): unknown;
}

let nodeAttempted = false;

function tryAutoRegisterNode(): boolean {
  if (currentAdapter) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  const proc = (globalThis as { process?: NodeProcessLike }).process;
  if (!proc?.versions?.node) return false;
  const adapter = buildNodeAdapter(proc);
  nodeAutoRegistered = adapter;
  registerProcessAdapter(adapter);
  return true;
}

/**
 * `getattr` / `setattr` / `set_noecho` (`vendor/ruby/v3.3.11/ext/io/console/console.c:252-291`)
 * on the terminal behind fd 0. Node exposes termios only through
 * `setRawMode`, which also clears `ICANON`, `ISIG` and `ICRNL` where
 * `set_noecho` clears echo alone, so the flags go through `stty(1)`, whose
 * `-g` form is the saved `conmode`. Answers `null` when stdin is not a
 * terminal or `stty` fails.
 */
function stty(proc: NodeProcessLike, args: string[]): string | null {
  if (!proc.stdin.isTTY) return null;
  const childProcess = proc.getBuiltinModule?.("node:child_process") as
    | {
        spawnSync(
          cmd: string,
          args: string[],
          opts: unknown,
        ): { status: number | null; stdout: unknown };
      }
    | undefined;
  if (childProcess == null) return null;
  const result = childProcess.spawnSync("stty", args, {
    stdio: [0, "pipe", "ignore"],
    encoding: "utf8",
  });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function buildNodeAdapter(proc: NodeProcessLike): ProcessAdapter {
  return {
    envSnapshot: () => ({ ...proc.env }),
    argvSnapshot: () => [...proc.argv],
    cwd: () => proc.cwd(),
    chdir: (dir) => proc.chdir(dir),
    platform: () => proc.platform,
    pid: () => proc.pid,
    setEnv: (key, value) => {
      if (value === undefined) delete proc.env[key];
      else proc.env[key] = value;
    },
    exit: (code) => proc.exit(code),
    setExitCode: (code) => {
      proc.exitCode = code;
    },
    onSignal: (name, handler) => {
      proc.on(name, handler);
      return () => {
        proc.off(name, handler);
      };
    },
    stdout: {
      write: (chunk) => proc.stdout.write(chunk),
      get isTTY() {
        return Boolean(proc.stdout.isTTY);
      },
      get columns() {
        return proc.stdout.columns;
      },
      get rows() {
        return proc.stdout.rows;
      },
    },
    stderr: {
      write: (chunk) => proc.stderr.write(chunk),
      get isTTY() {
        return Boolean(proc.stderr.isTTY);
      },
      get columns() {
        return proc.stderr.columns;
      },
      get rows() {
        return proc.stderr.rows;
      },
    },
    stdin: {
      get isTTY() {
        return Boolean(proc.stdin.isTTY);
      },
      getattr: () => stty(proc, ["-g"]),
      setattr: (t) => stty(proc, [t]) !== null,
      setNoecho: () => stty(proc, ["-echo", "-echoe", "-echok", "-echonl"]) !== null,
      read: () =>
        new Promise<string | null>((resolve, reject) => {
          if (proc.stdin.readableEnded || proc.stdin.destroyed) {
            resolve(null);
            return;
          }
          const onData = (...args: unknown[]) => {
            cleanup();
            const data = args[0];
            resolve(
              typeof data === "string"
                ? data
                : data && typeof (data as { toString(): string }).toString === "function"
                  ? (data as { toString(): string }).toString()
                  : null,
            );
          };
          const onTerminal = () => {
            cleanup();
            resolve(null);
          };
          const onError = (...args: unknown[]) => {
            cleanup();
            const err = args[0];
            reject(err instanceof Error ? err : new Error(String(err)));
          };
          const cleanup = () => {
            proc.stdin.pause?.();
            proc.stdin.off("data", onData);
            proc.stdin.off("end", onTerminal);
            proc.stdin.off("close", onTerminal);
            proc.stdin.off("error", onError);
          };
          proc.stdin.once("data", onData);
          proc.stdin.once("end", onTerminal);
          proc.stdin.once("close", onTerminal);
          proc.stdin.once("error", onError);
        }),
    },
  };
}

/** @internal */
export function __INTERNAL_resetProcessAdapter_TEST_ONLY(): void {
  currentAdapter = null;
  nodeAutoRegistered = null;
  nodeAttempted = false;
  stdinBuffer = "";
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  argvInternal.length = 0;
}

tryAutoRegisterNode();
