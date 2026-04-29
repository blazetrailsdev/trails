/**
 * Process adapter — routes `process.*` operations through a swappable
 * adapter so trailties and other packages can run under non-Node hosts
 * (browser, sandboxed test envs).
 *
 * The exported `env` and `argv` are populated by copying the registered
 * adapter's snapshot at registration time. They are typed as readonly to
 * prevent compile-time mutation; runtime mutation outside `setEnv` is
 * unsupported and may diverge from the adapter's view.
 *
 * Streams (`stdout`, `stderr`, `stdin`) delegate to the registered
 * adapter at call time so a swap takes effect immediately.
 *
 * This module uses structural types only — no `NodeJS.Process` /
 * `Buffer` references — so it typechecks without `@types/node`.
 */

export interface WriteStream {
  write(chunk: string): boolean;
  readonly isTTY: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export interface ReadStream {
  readonly isTTY: boolean;
  read(): Promise<string | null>;
}

export type SignalName = "SIGINT" | "SIGTERM";

export interface ProcessAdapter {
  envSnapshot(): Record<string, string | undefined>;
  argvSnapshot(): readonly string[];
  cwd(): string;
  chdir(dir: string): void;
  platform(): string;
  setEnv(key: string, value: string | undefined): void;
  exit(code?: number): never;
  setExitCode(code: number): void;
  onSignal(name: SignalName, handler: () => void): () => void;
  readonly stdout: WriteStream;
  readonly stderr: WriteStream;
  readonly stdin: ReadStream;
}

// Use a null-prototype object to avoid prototype-pollution semantics if
// an adapter snapshot or `setEnv` call passes `__proto__`/`constructor`
// as a key (env keys can come from dotenv shims).
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

export const stdout: WriteStream = {
  write: (chunk) => requireAdapter().stdout.write(chunk),
  get isTTY() {
    return requireAdapter().stdout.isTTY;
  },
  get columns() {
    return requireAdapter().stdout.columns;
  },
  get rows() {
    return requireAdapter().stdout.rows;
  },
};

export const stderr: WriteStream = {
  write: (chunk) => requireAdapter().stderr.write(chunk),
  get isTTY() {
    return requireAdapter().stderr.isTTY;
  },
  get columns() {
    return requireAdapter().stderr.columns;
  },
  get rows() {
    return requireAdapter().stderr.rows;
  },
};

export const stdin: ReadStream = {
  get isTTY() {
    return requireAdapter().stdin.isTTY;
  },
  read: () => requireAdapter().stdin.read(),
};

export function cwd(): string {
  return requireAdapter().cwd();
}

export function chdir(dir: string): void {
  requireAdapter().chdir(dir);
}

export function platform(): string {
  return requireAdapter().platform();
}

export function exit(code?: number): never {
  return requireAdapter().exit(code);
}

export function setExitCode(code: number): void {
  requireAdapter().setExitCode(code);
}

export function onSignal(name: SignalName, handler: () => void): () => void {
  return requireAdapter().onSignal(name, handler);
}

/**
 * Mutate the `env` snapshot. Use sparingly — `env` is intended to be
 * immutable after registration. Legitimate uses: test setup, dotenv
 * shims at boot. Updates both the underlying adapter and the exported
 * `env` object's contents.
 */
export function setEnv(key: string, value: string | undefined): void {
  requireAdapter().setEnv(key, value);
  if (value === undefined) {
    delete envInternal[key];
  } else {
    envInternal[key] = value;
  }
}

export function registerProcessAdapter(adapter: ProcessAdapter): void {
  // Take both snapshots before mutating module state so a throw from
  // either method leaves the registry untouched (atomic registration).
  const envSnapshot = adapter.envSnapshot();
  const argvSnapshot = adapter.argvSnapshot();

  currentAdapter = adapter;
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  // Skip `undefined` values so `key in env` stays consistent with
  // `setEnv(key, undefined)` semantics (both mean "absent").
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value !== undefined) envInternal[key] = value;
  }
  argvInternal.length = 0;
  argvInternal.push(...argvSnapshot);
}

export function getProcessAdapter(): ProcessAdapter {
  return requireAdapter();
}

/**
 * Discoverability hook — symmetry with `fsAdapterConfig`,
 * `cryptoAdapterConfig`, etc.
 *
 * processAdapter intentionally diverges from the named-registry pattern
 * used by fs/crypto/os/child-process: there is only one "process" the
 * program runs in, and the exported `env` / `argv` snapshots require a
 * single source of truth. So `processAdapterConfig.adapter` returns
 * `"node"` when the auto-registered Node adapter is active, `"custom"`
 * when a user-supplied adapter is registered, or `null` when none is.
 * It is read-only — the way to switch is `registerProcessAdapter()`.
 */
export const processAdapterConfig = {
  get adapter(): string | null {
    if (!currentAdapter) return null;
    return currentAdapter === nodeAutoRegistered ? "node" : "custom";
  },
};

let nodeAutoRegistered: ProcessAdapter | null = null;

// Structural shape of `node:process` we use. Avoids `NodeJS.Process` so
// this module typechecks without `@types/node`.
interface NodeStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  readableEnded?: boolean;
  destroyed?: boolean;
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
  exit(code?: number): never;
  exitCode: number | string | undefined;
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
  stdout: NodeStream;
  stderr: NodeStream;
  stdin: NodeStream;
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

function buildNodeAdapter(proc: NodeProcessLike): ProcessAdapter {
  return {
    envSnapshot: () => ({ ...proc.env }),
    argvSnapshot: () => [...proc.argv],
    cwd: () => proc.cwd(),
    chdir: (dir) => proc.chdir(dir),
    platform: () => proc.platform,
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
      read: () =>
        new Promise<string | null>((resolve, reject) => {
          // Bail early if the stream is already terminal.
          if (proc.stdin.readableEnded || proc.stdin.destroyed) {
            resolve(null);
            return;
          }
          const onData = (...args: unknown[]) => {
            cleanup();
            const data = args[0];
            // Node passes Buffer or string depending on encoding. Accept
            // either — coerce to string structurally without referencing
            // the `Buffer` type.
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
            proc.stdin.off("data", onData);
            proc.stdin.off("end", onTerminal);
            proc.stdin.off("close", onTerminal);
            proc.stdin.off("error", onError);
          };
          proc.stdin.once("data", onData);
          // Listen to both `end` and `close` — some streams emit only
          // `close` (e.g. on destroy without prior end), which previously
          // could leave the Promise pending and leak the data listener.
          proc.stdin.once("end", onTerminal);
          proc.stdin.once("close", onTerminal);
          proc.stdin.once("error", onError);
        }),
    },
  };
}

/**
 * @internal
 *
 * Test-only helper — NOT part of the public API. Resets the adapter
 * registry and clears `env`/`argv` snapshots so a subsequent
 * `registerProcessAdapter` call (or auto-register) starts fresh.
 *
 * Although this function is reachable via the package's `./*` subpath
 * export, calling it from production code is unsupported and may break
 * without notice. To switch adapters in a host, call
 * `registerProcessAdapter()` with the new adapter — that overwrites
 * the active one.
 */
export function __INTERNAL_resetProcessAdapter_TEST_ONLY(): void {
  currentAdapter = null;
  nodeAutoRegistered = null;
  nodeAttempted = false;
  for (const k of Object.keys(envInternal)) delete envInternal[k];
  argvInternal.length = 0;
}

// Eagerly register the Node default at module load.
//
// Why eager rather than lazy/first-access:
//
// 1. The exported `env` and `argv` are plain frozen objects populated by
//    *copying* the adapter's snapshot at registration time. Direct reads
//    like `env.FOO` and `argv[0]` cannot trigger auto-registration —
//    they bypass any function call. A lazy approach would require a
//    Proxy or getters, but the trailties build-out plan explicitly
//    chose plain frozen objects ("No Proxy") to keep the surface
//    simple and serializable.
// 2. `child-process-adapter`'s default `env` for `spawnSync` spreads
//    the exported `env`. Without eager registration, that would be
//    empty under Node and strip PATH from spawned processes.
// 3. Standard env shims (dotenv etc.) run at the entry-point's very
//    top, before activesupport is imported, so they're already in
//    `process.env` by the time this snapshot runs.
//
// In non-Node hosts this is a no-op; the host registers its own
// adapter before any consumer reads the snapshots.
tryAutoRegisterNode();
