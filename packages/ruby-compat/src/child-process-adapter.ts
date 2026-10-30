import { env as processEnv } from "./process-adapter.js";
import { Errno } from "./errno.js";
import { File } from "./file.js";
import { IOError } from "./io-error.js";
import { PipeIO, STDERR, STDOUT, type IO } from "./io.js";

export interface SpawnSyncOptions {
  input?: string | Uint8Array;
  env?: Record<string, string | undefined>;
  encoding?: "utf8" | "utf-8";
  cwd?: string;
  out?: string;
  in?: string;
}

export interface SpawnSyncResult {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/**
 * What `waitpid(2)` reports for a child (`rb_process_status_wait`,
 * `vendor/ruby/v3.3.11/process.c:1198`): `pid` is `null` when the child was
 * never spawned, `status` its exit status and `null` when it did not exit, and
 * `error` what the spawn failed with.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface WaitStatus {
  pid: number | null;
  status: number | null;
  signal: string | null;
  error?: Error;
}

export interface ChildProcessAdapter {
  spawnSync(cmd: string, args: string[], options?: SpawnSyncOptions): SpawnSyncResult;
  /**
   * Runs the child with the parent's stdio and resolves once it is waited for.
   * With no `args`, `command` is a command line for `/bin/sh -c` (`proc_exec_sh`,
   * `vendor/ruby/v3.3.11/process.c:1788`); with `args` it is the program, exec'd
   * with that argv and no shell (`proc_exec_cmd`, `process.c:1741`). `options.out`
   * is `out: filename`: stdout opened on that file, truncated (`process.c:1985`),
   * or `out: io`: stdout dup2'd from that IO (`check_exec_redirect_fd`,
   * `process.c:1963-1968`). An {@link IO.pipe} end has no descriptor, so the
   * child's stdout is pumped into its in-process buffer, and bytes written after
   * the pipe closes are dropped, as the child's SIGPIPE would lose them.
   * `options.err` is the same for stderr (`check_exec_redirect`,
   * `process.c:2009`). A stream with no redirect is {@link STDOUT} or
   * {@link STDERR} at its current descriptor, which {@link IO.reopen} moves.
   */
  system?(
    command: string,
    env: Record<string, string | undefined>,
    args?: string[] | null,
    options?: { out?: string | IO; err?: string | IO },
  ): Promise<WaitStatus>;
  /**
   * Runs `command` through `/bin/sh -c`, or with no `args` the program `command`
   * exec'd with that argv and no shell, with stdout and stderr on one pipe,
   * as `Open3.popen2e` wires them (`vendor/ruby/v3.3.11/lib/open3.rb:508-523`),
   * and a stdin pipe closed at once (`open3.rb:928`), and resolves with what
   * it wrote.
   */
  capture2e?(
    command: string,
    env: Record<string, string | undefined>,
    args?: string[] | null,
  ): Promise<[output: string, status: WaitStatus]>;
  /**
   * Runs the child with stdin, stdout and stderr on three pipes, as
   * `Open3.popen3` wires them (`vendor/ruby/v3.3.11/lib/open3.rb:218-235`),
   * writes `stdinData` to stdin and closes it (`open3.rb:670-675`), and
   * resolves with what it wrote to each. Stdout is a String when its bytes are
   * valid UTF-8, and otherwise those bytes: Ruby's `o.read` keeps the bytes of
   * a String whose encoding is broken (`vendor/ruby/v3.3.11/lib/open3.rb:665`),
   * and a JS string cannot hold them. With no `args`, `command` is a command
   * line for `/bin/sh -c`; with `args` it is the program, exec'd with that argv
   * and no shell, as {@link ChildProcessAdapter.system} spawns it.
   */
  capture3?(
    command: string,
    env: Record<string, string | undefined>,
    args: string[] | null,
    stdinData: string | Uint8Array,
  ): Promise<[stdout: string | Uint8Array, stderr: string, status: WaitStatus]>;
  /**
   * Runs `command` with `args` as its argv and no shell, as `IO.popen` execs
   * an Array command (`rb_io_popen`, `vendor/ruby/v3.3.11/io.c:7968-7983`),
   * with stdin inherited, stdout on a pipe and stderr on the `err` descriptor
   * (inherited when `null`), and resolves with what it wrote to stdout.
   */
  popen?(
    command: string,
    args: string[],
    env: Record<string, string | undefined>,
    err: number | null,
  ): Promise<[stdout: Uint8Array, status: WaitStatus]>;
}

const registry = new Map<string, ChildProcessAdapter>();
let currentAdapterName: string | null = null;
let resolved: ChildProcessAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerChildProcessAdapter(name: string, adapter: ChildProcessAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

type NodeSpawnSyncResult = {
  status: number | null;
  signal: string | null;
  stdout: unknown;
  stderr: unknown;
  error?: Error;
};

type NodeReadable = {
  setEncoding(encoding: string): void;
  on(event: "data", listener: ((chunk: string) => void) | ((chunk: Uint8Array) => void)): void;
};

type NodeChild = {
  pid?: number;
  stdin: {
    end(data?: string | Uint8Array): void;
    on(event: "error", listener: () => void): void;
  } | null;
  stdout: NodeReadable | null;
  stderr: NodeReadable | null;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
};

type NodeChildProcess = {
  spawnSync: (cmd: string, args: string[], opts?: unknown) => NodeSpawnSyncResult;
  spawn: (cmd: string, args: string[], opts?: unknown) => NodeChild;
};

function spawnChild(
  cp: NodeChildProcess,
  file: string,
  args: string[],
  env: Record<string, string | undefined>,
  stdio: unknown,
  read: ((chunk: string) => void) | { bytes: (chunk: Uint8Array) => void },
  input?: string | Uint8Array,
  readErr?: ((chunk: string) => void) | { bytes: (chunk: Uint8Array) => void },
): Promise<WaitStatus> {
  return new Promise((resolve) => {
    const child = cp.spawn(file, args, { env, stdio });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
    if (typeof read === "function") {
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", read);
    } else {
      child.stdout?.on("data", read.bytes);
    }
    if (typeof readErr === "function") {
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", readErr);
    } else if (readErr !== undefined) {
      child.stderr?.on("data", readErr.bytes);
    }
    child.on("error", (error) =>
      resolve({ pid: child.pid ?? null, status: null, signal: null, error }),
    );
    child.on("close", (status, signal) => resolve({ pid: child.pid ?? null, status, signal }));
  });
}

function wrap(cp: NodeChildProcess): ChildProcessAdapter {
  return {
    spawnSync(cmd, args, options) {
      const outFile = options?.out != null ? File.open(options.out, "w") : null;
      const inFile = options?.in != null ? File.open(options.in, "r") : null;
      let result: NodeSpawnSyncResult;
      try {
        result = cp.spawnSync(cmd, args, {
          input: options?.input,
          env: options?.env ?? { ...processEnv },
          encoding: options?.encoding ?? "utf8",
          cwd: options?.cwd,
          ...(outFile !== null || inFile !== null
            ? { stdio: [inFile?.fileno() ?? "pipe", outFile?.fileno() ?? "pipe", "pipe"] }
            : {}),
        });
      } finally {
        outFile?.close();
        inFile?.close();
      }
      return {
        status: result.status,
        signal: result.signal,
        stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? ""),
        stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? ""),
        error: result.error,
      };
    },
    system(command, env, args, options) {
      const opened: File[] = [];
      const redirect = (target: string | IO | undefined, inherited: IO) => {
        const file = typeof target === "string" ? File.open(target, "w") : null;
        if (file !== null) opened.push(file);
        const io = file ?? (target as IO | undefined) ?? inherited;
        const pipe = io instanceof PipeIO ? io : null;
        const read = {
          bytes: (chunk: Uint8Array) => {
            try {
              pipe?.write(chunk);
            } catch (error) {
              if (!(error instanceof Errno.EPIPE || error instanceof IOError)) throw error;
            }
          },
        };
        return { stdio: pipe ? "pipe" : io.fileno(), read };
      };
      const out = redirect(options?.out, STDOUT);
      const err = redirect(options?.err, STDERR);
      const stdio = ["inherit", out.stdio, err.stdio];
      const status =
        args == null
          ? spawnChild(cp, "/bin/sh", ["-c", command], env, stdio, out.read, undefined, err.read)
          : spawnChild(cp, command, args, env, stdio, out.read, undefined, err.read);
      return status.finally(() => {
        for (const file of opened) file.close();
      });
    },
    async capture2e(command, env, args) {
      let output = "";
      const read = (chunk: string): void => {
        output += chunk;
      };
      const status =
        args == null
          ? await spawnChild(
              cp,
              "/bin/sh",
              ["-c", 'exec 2>&1; eval "$1"', "sh", command],
              env,
              ["pipe", "pipe", "ignore"],
              read,
            )
          : await spawnChild(cp, command, args, env, ["pipe", "pipe", "pipe"], read, "", read);
      return [output, status];
    },
    async capture3(command, env, args, stdinData) {
      const stdoutChunks: Uint8Array[] = [];
      let stderr = "";
      const [file, argv] = args == null ? ["/bin/sh", ["-c", command]] : [command, args];
      const status = await spawnChild(
        cp,
        file,
        argv,
        env,
        ["pipe", "pipe", "pipe"],
        { bytes: (chunk) => stdoutChunks.push(chunk) },
        stdinData,
        (chunk) => {
          stderr += chunk;
        },
      );
      const bytes = new Uint8Array(stdoutChunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const chunk of stdoutChunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let stdout: string | Uint8Array;
      try {
        stdout = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        stdout = bytes;
      }
      return [stdout, stderr, status];
    },
    async popen(command, args, env, err) {
      const chunks: Uint8Array[] = [];
      const status = await spawnChild(
        cp,
        command,
        args,
        env,
        ["inherit", "pipe", err ?? STDERR.fileno()],
        { bytes: (chunk) => chunks.push(chunk) },
      );
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return [bytes, status];
    },
  };
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    registry.set("node", wrap(req("node:child_process") as NodeChildProcess));
    return true;
  } catch {
    return false;
  }
}

function resolve(): ChildProcessAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Child-process adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No child-process adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.childProcessAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export function getChildProcess(): ChildProcessAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export async function getChildProcessAsync(): Promise<ChildProcessAdapter> {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const childProcessAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
