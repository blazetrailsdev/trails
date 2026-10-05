import { beforeEach } from "vitest";
import {
  File,
  Gem,
  rbArgv,
  rbEnsure,
  setArg0,
  setEnv,
  setVerbose,
  stderr as $stderr,
  stdout as $stdout,
  StringIO,
  verbose,
} from "@blazetrails/ruby-compat";
import { setThorRunner } from "../base.js";
import { Base } from "../shell.js";
import { Basic } from "../shell/basic.js";

setEnv("THOR_COLUMNS", "10000");
setArg0("thor");
setThorRunner(true);
rbArgv().length = 0;
Base.shell = Basic;

await import("./fixtures/enum.js");
await import("./fixtures/script.js");
await import("./fixtures/subcommand.js");
await import("./fixtures/command.js");

beforeEach(() => {
  rbArgv().length = 0;
});

const __FILE__ = decodeURIComponent(
  new URL(import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i, ""),
);

export async function capture(stream: string, block: () => unknown): Promise<string> {
  stream = stream.replace(/^:/, "");
  const io = ({ stdout: $stdout, stderr: $stderr } as Record<string, { write: unknown }>)[stream];
  const write = io.write;
  const stringIo = new StringIO();
  io.write = (chunk: string) => stringIo.write(chunk) > 0;
  return rbEnsure(
    async () => {
      await block();
      return stringIo.string();
    },
    () => {
      io.write = write;
    },
  );
}

export function sourceRoot(): string {
  return File.join(File.dirname(__FILE__), "fixtures");
}

export function destinationRoot(): string {
  return File.join(File.dirname(__FILE__), "sandbox");
}

export function silenceWarnings<T>(block: () => T): T {
  const oldVerbose = verbose();
  setVerbose(null);
  return rbEnsure(block, () => {
    setVerbose(oldVerbose);
  });
}

export function isWindows(): boolean {
  return Gem.isWinPlatform();
}

export const silence = capture;
