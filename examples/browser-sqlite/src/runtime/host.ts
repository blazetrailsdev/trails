import path from "path-browserify";
import * as yaml from "yaml";
import {
  fsAdapterConfig,
  osAdapterConfig,
  registerOsAdapter,
  registerFsAdapter,
  registerProcessAdapter,
  type PathAdapter,
  type ProcessAdapter,
} from "@blazetrails/ruby-compat";
import { registerPsychAdapter } from "@blazetrails/ruby-compat/psych-adapter";
import type { VirtualFs } from "./vfs.ts";

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";
export type ConsoleSink = (level: LogLevel, text: string) => void;

/**
 * Registers the browser's stand-ins for a Node process: a single process
 * whose stdout and stderr go to the editor's console, and a filesystem that
 * is the virtual one. A file's URL is the path the service worker serves its
 * transpiled module under, so `import(pathToFileURL(file))` — how Zeitwerk
 * and `Kernel#load` evaluate a file — loads the app's code from the VFS.
 */
export function installHost(vfs: VirtualFs, moduleBase: string, sink: ConsoleSink): void {
  const stream = (level: LogLevel) => ({
    isTTY: false,
    write(chunk: string) {
      sink(level, chunk.replace(/\n$/, ""));
      return true;
    },
  });
  const env: Record<string, string | undefined> = { TRAILS_ENV: "development" };
  const browserProcess: ProcessAdapter = {
    envSnapshot: () => ({ ...env }),
    argvSnapshot: () => ["browser", "trails"],
    cwd: () => vfs.cwd,
    chdir: (dir) => vfs.chdir(dir),
    platform: () => "browser",
    pid: () => 1,
    setEnv(key, value) {
      env[key] = value;
    },
    exit(code) {
      throw new Error(`exit(${code ?? 0}) called in the browser`);
    },
    setExitCode() {},
    onSignal: () => () => {},
    stdout: stream("log"),
    stderr: stream("warn"),
    stdin: { isTTY: false, read: async () => null },
  };
  registerProcessAdapter(browserProcess);

  const base = new URL(moduleBase, location.href);
  const browserPath: PathAdapter = {
    ...(path as unknown as PathAdapter),
    isAbsolute: (p) => p.startsWith("/"),
    relative: (from, to) => path.relative(from, to),
    pathToFileURL: (p) => new URL(`.${path.resolve("/", p)}`, base),
    fileURLToPath: (url) => {
      const href = typeof url === "string" ? url : String(url);
      if (href.startsWith(base.href)) return `/${href.slice(base.href.length).split(/[?#]/)[0]}`;
      if (href.startsWith("file://")) return decodeURIComponent(new URL(href).pathname);
      return href;
    },
  };
  registerFsAdapter("browser", vfs.adapter(), browserPath);
  fsAdapterConfig.adapter = "browser";
  registerOsAdapter("browser", {
    tmpdir: () => "/tmp",
    platform: () => "browser",
    cwd: () => vfs.cwd,
    availableParallelism: () => 1,
  });
  osAdapterConfig.adapter = "browser";
  registerPsychAdapter("yaml", yaml);
}
