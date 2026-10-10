import { Errno, SystemCallError } from "./errno.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { RuntimeError } from "./runtime-error.js";
import { num2long, rbCheckStringType, stringValue } from "./string/support.js";

export interface WriteStream {
  write(chunk: string): boolean;
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export interface StdStream extends WriteStream {
  flush(): StdStream;
}

export interface ReadStream {
  readonly isTTY: boolean;
  read(): Promise<string | null>;
  getattr?(): string;
  setattr?(t: string): void;
  setNoecho?(): void;
}

export type SignalName = "SIGINT" | "SIGTERM";

export interface ProcessAdapter {
  envSnapshot(): Record<string, string | undefined>;
  argvSnapshot(): readonly string[];
  cwd(): string;
  chdir(dir: string): void;
  platform(): string;
  execPath?(): string;
  pid(): number;
  setEnv(key: string, value: string | undefined): void;
  exit(code?: number): never;
  /**
   * Runs `argv[0]` with `argv.slice(1)` on the parent's stdio and exits with
   * its status, which is as near as a host with no `execve(2)` comes to
   * `proc_exec_cmd` (`vendor/ruby/v3.3.11/process.c:1729`). A command that
   * could not be run raises its `SystemCallError`.
   */
  exec?(argv: readonly string[]): never;
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

const rbArgvInternal: string[] = [];
let prognameInternal = "";

/**
 * MRI's `ARGV` (`rb_argv`, vendor/ruby/v3.3.11/ruby.c:2980), which
 * `ruby_set_argv` (vendor/ruby/v3.3.11/ruby.c:2984) fills with the arguments
 * that follow the script name.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbArgv(): string[] {
  return rbArgvInternal;
}

/**
 * MRI's `$PROGRAM_NAME` / `$0` (`rb_progname`,
 * vendor/ruby/v3.3.11/ruby.c:2970-2971): the name of the script being run.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbProgname(): string {
  return prognameInternal;
}

/**
 * MRI's `$0 =` (`set_arg0`, vendor/ruby/v3.3.11/ruby.c:2842-2849), the writer
 * half of {@link rbProgname}.
 *
 * @noRailsEquivalent PERMANENT
 */
export function setArg0(val: string): void {
  if (!currentAdapter && !tryAutoRegisterNode()) throw new RuntimeError("$0 not initialized");

  prognameInternal = val;
}

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
export const stdout: StdStream = {
  /** @noRailsEquivalent PERMANENT */
  write: (chunk) => requireAdapter().stdout.write(chunk),
  /**
   * `rb_io_flush` (`vendor/ruby/v3.3.11/io.c:2379`). The adapter stream holds no buffer.
   *
   * @noRailsEquivalent PERMANENT
   */
  flush: () => stdout,
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
export const stderr: StdStream = {
  /** @noRailsEquivalent PERMANENT */
  write: (chunk) => requireAdapter().stderr.write(chunk),
  /**
   * `rb_io_flush` (`vendor/ruby/v3.3.11/io.c:2379`). The adapter stream holds no buffer.
   *
   * @noRailsEquivalent PERMANENT
   */
  flush: () => stderr,
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
let stdinLineno = 0;

type GetlineOpts = { chomp?: boolean | null };

/** `extract_getline_args` (`vendor/ruby/v3.3.11/io.c:4065-4086`), whose `$/` is `"\n"`. */
function extractGetlineArgs(args: unknown[]): { rs: string | null; limit: number } {
  let rs: string | null = "\n";
  let lim: unknown = null;
  if (args.length === 1) {
    let tmp: string | null = null;
    if (args[0] == null || (tmp = rbCheckStringType(args[0])) != null) {
      rs = tmp;
    } else {
      lim = args[0];
    }
  } else if (2 <= args.length) {
    rs = args[0] == null ? null : stringValue(args[0]);
    lim = args[1];
  }
  return { rs, limit: lim == null ? -1 : num2long(lim) };
}

/**
 * `appendline`'s limit (`vendor/ruby/v3.3.11/io.c:4210-4225`): the index just past
 * the character that brings the UTF-8 byte count to `limit`, so a character
 * is never split, or `-1` while the buffer holds fewer bytes.
 */
function limitEnd(limit: number): number {
  let bytes = 0;
  let i = 0;
  for (const ch of stdinBuffer) {
    const c = ch.codePointAt(0)!;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    i += ch.length;
    if (bytes >= limit) return i;
  }
  return -1;
}

/** `swallow` (`vendor/ruby/v3.3.11/io.c:3937`): drops every leading `term`. */
async function swallow(term: string): Promise<void> {
  for (;;) {
    let i = 0;
    while (i < stdinBuffer.length && stdinBuffer[i] === term) i++;
    stdinBuffer = stdinBuffer.slice(i);
    if (stdinBuffer !== "") return;
    const chunk = await requireAdapter().stdin.read();
    if (chunk == null) return;
    stdinBuffer += chunk;
  }
}

/** @noRailsEquivalent PERMANENT */
export const stdin: ReadStream & {
  gets(
    ...args:
      | [opts?: GetlineOpts]
      | [sepOrLimit: string | number | null, opts?: GetlineOpts]
      | [sep: string | null, limit: number | null, opts?: GetlineOpts]
  ): Promise<string | null>;
  noecho<T>(block: (io: typeof stdin) => T): T;
  readonly lineno: number;
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
   * `IO#gets` (`vendor/ruby/v3.3.11/io.c:4363` `rb_io_gets_m`) through
   * `prepare_getline_args` (`io.c:4118-4125`) and `rb_io_getline_0`
   * (`io.c:4128-4239`): `gets(sep = $/, limit = nil, chomp: false)`, where a
   * lone Integer is the limit, a `nil` separator reads to end of file, `""`
   * is paragraph mode, and `limit` counts bytes. Answers `nil` at end of file.
   * Asynchronous, because a stdin read is; what the adapter delivered past
   * the line is kept for the next read. `lineno` counts each line not cut by
   * the limit (`io.c:4232-4234`). `rb_io_gets_m`'s `rb_lastline_set`
   * (`io.c:4368`) is not ported: `$_` is a variable of the CALLER's frame,
   * and JS has no way to write one; ARGF, whose `last_lineno` is `$.`
   * (`io.c:4250-4258`), is not ported either.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#gets`, which Thor calls on
   * `$stdin` (`vendor/thor/v1.3.2/lib/thor/line_editor/basic.rb:25`).
   */
  async gets(...args: unknown[]) {
    let chomp = false;
    const opts = args[args.length - 1];
    if (opts != null && typeof opts === "object" && !("toInt" in opts)) {
      args = args.slice(0, -1);
      const c = (opts as GetlineOpts).chomp;
      chomp = c != null && c !== false;
    }
    const { rs, limit } = extractGetlineArgs(args);

    if (rs == null && limit < 0) {
      let str = stdinBuffer;
      stdinBuffer = "";
      for (let chunk; (chunk = await requireAdapter().stdin.read()) != null; ) str += chunk;
      if (str === "") return null;
      stdinLineno++;
      return str;
    } else if (limit === 0) {
      return "";
    }

    let rsptr = rs;
    const rspara = rs === "";
    if (rspara) {
      rsptr = "\n\n";
      await swallow("\n");
    }
    for (;;) {
      const p = rsptr == null ? -1 : stdinBuffer.indexOf(rsptr);
      const e = p === -1 ? -1 : p + rsptr!.length;
      const l = limit < 0 ? -1 : limitEnd(limit);
      if (e !== -1 && (l === -1 || e <= l)) {
        let str = stdinBuffer.slice(0, e);
        stdinBuffer = stdinBuffer.slice(e);
        if (chomp) str = str.slice(0, rs === "\n" && str[p - 1] === "\r" ? p - 1 : p);
        if (rspara) await swallow("\n");
        stdinLineno++;
        return str;
      }
      if (l !== -1) {
        const str = stdinBuffer.slice(0, l);
        stdinBuffer = stdinBuffer.slice(l);
        return str;
      }
      const chunk = await requireAdapter().stdin.read();
      if (chunk == null) {
        if (stdinBuffer === "") return null;
        const str = stdinBuffer;
        stdinBuffer = "";
        stdinLineno++;
        return str;
      }
      stdinBuffer += chunk;
    }
  },
  /**
   * `IO#lineno` (`vendor/ruby/v3.3.11/io.c:4390` `rb_io_lineno`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#lineno`, the counter `gets`
   * advances.
   */
  get lineno() {
    return stdinLineno;
  },
  /**
   * `IO#noecho` (`vendor/ruby/v3.3.11/ext/io/console/console.c:633`
   * `console_noecho`): `ttymode` (`console.c:334-383`) saves the terminal
   * mode with `getattr`, clears only the echo flags with `set_noecho`
   * (`console.c:283-291`), yields the IO, and `setattr`s the saved mode
   * back — after a returned promise settles, since a block that awaits a
   * read has not finished when it returns. The adapter raises the
   * `SystemCallError` for a mode that cannot be read, set or restored, as
   * `ttymode`'s `rb_syserr_fail` (`console.c:365-379`) does, a failed restore
   * even after the block completed; an adapter with no terminal control is
   * `Errno::ENOTTY`.
   *
   * @noRailsEquivalent PERMANENT — `io/console`'s `IO#noecho`, which Thor
   * calls on `$stdin` (`vendor/thor/v1.3.2/lib/thor/line_editor/basic.rb:29`).
   */
  noecho<T>(block: (io: typeof stdin) => T): T {
    const io = requireAdapter().stdin;
    if (io.getattr == null || io.setattr == null || io.setNoecho == null) {
      throw new Errno.ENOTTY();
    }
    const t = io.getattr();
    io.setNoecho();
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

/**
 * Mirrors: Ruby's Kernel#exit — vendor/ruby/v3.3.11/process.c:4467 `rb_f_exit`,
 * whose status goes through `exit_status_code` (vendor/ruby/v3.3.11/process.c:4398).
 *
 * @noRailsEquivalent PERMANENT
 */
export function exit(code?: number | boolean): never {
  return requireAdapter().exit(typeof code === "boolean" ? (code ? 0 : 1) : code);
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

/**
 * `Kernel#exec` (`vendor/ruby/v3.3.11/process.c:3015` `rb_f_exec`) for the
 * `exec(exe_path, *args)` form: the process is replaced by `exe_path`, run
 * with `args` and no shell, and the call does not return. A command that
 * cannot be run raises its `SystemCallError` (`rb_syserr_fail_str`,
 * `process.c:3041`), and a host with no way to run one raises
 * `rb_notimplement`'s `NotImplementedError` (`vendor/ruby/v3.3.11/error.c:3498`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#exec`
 * (`vendor/ruby/v3.3.11/process.c:3015`).
 */
export function exec(...argv: [exePath: string, ...args: string[]]): never {
  const adapter = requireAdapter();
  if (adapter.exec === undefined) {
    throw new NotImplementedError("exec() function is unimplemented on this machine");
  }

  return adapter.exec(argv);
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
  stdinLineno = 0;
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value !== undefined) envInternal[key] = value;
  }
  argvInternal.length = 0;
  argvInternal.push(...argvSnapshot);
  prognameInternal = argvSnapshot[1] ?? "";
  rbArgvInternal.length = 0;
  rbArgvInternal.push(...argvSnapshot.slice(2));
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
  execPath: string;
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
 * `-g` form is the saved `conmode`. A failure raises the `SystemCallError`
 * whose `strerror` text `stty` reported, as `rb_syserr_fail` does with the
 * failing call's errno. Node exposes no `SetConsoleMode`, so the Windows arm
 * (`console.c:289`, clearing `ENABLE_ECHO_INPUT`) is not reachable and a
 * Windows console raises `Errno::ENOTTY`; its convergence is
 * `ruby-compat-noecho-windows-console-echo-input`.
 */
function stty(proc: NodeProcessLike, args: string[]): string {
  const childProcess = proc.getBuiltinModule?.("node:child_process") as
    | {
        spawnSync(
          cmd: string,
          args: string[],
          opts: unknown,
        ): { status: number | null; stdout: unknown; stderr: unknown };
      }
    | undefined;
  if (!proc.stdin.isTTY || childProcess == null) throw new Errno.ENOTTY();
  const result = childProcess.spawnSync("stty", args, {
    stdio: [0, "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status === 0) return String(result.stdout).trim();
  const err =
    String(result.stderr ?? "")
      .trim()
      .split(": ")
      .pop() ?? "";
  if (err === "" || err === "Inappropriate ioctl for device") throw new Errno.ENOTTY();
  throw new SystemCallError(err);
}

function buildNodeAdapter(proc: NodeProcessLike): ProcessAdapter {
  return {
    envSnapshot: () => ({ ...proc.env }),
    argvSnapshot: () => [...proc.argv],
    cwd: () => proc.cwd(),
    chdir: (dir) => proc.chdir(dir),
    platform: () => proc.platform,
    execPath: () => proc.execPath,
    pid: () => proc.pid,
    setEnv: (key, value) => {
      if (value === undefined) delete proc.env[key];
      else proc.env[key] = value;
    },
    exit: (code) => proc.exit(code),
    exec: (argv) => {
      const childProcess = proc.getBuiltinModule?.("node:child_process") as
        | {
            spawnSync(
              cmd: string,
              args: string[],
              opts: unknown,
            ): { status: number | null; error?: Error & { code?: string } };
          }
        | undefined;
      if (childProcess == null) {
        throw new NotImplementedError("exec() function is unimplemented on this machine");
      }
      const result = childProcess.spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
      if (result.error !== undefined) {
        if (result.error.code === "ENOENT") throw new Errno.ENOENT(argv[0]);
        throw new SystemCallError(`${result.error.message} - ${argv[0]}`);
      }
      return proc.exit(result.status ?? 1);
    },
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
      setattr: (t) => {
        stty(proc, [t]);
      },
      setNoecho: () => {
        stty(proc, ["-echo", "-echoe", "-echok", "-echonl"]);
      },
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
  stdinLineno = 0;
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  argvInternal.length = 0;
  prognameInternal = "";
  rbArgvInternal.length = 0;
}

tryAutoRegisterNode();
