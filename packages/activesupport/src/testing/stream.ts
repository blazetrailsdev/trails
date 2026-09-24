import { stderr as STDERR, stdout as STDOUT } from "@blazetrails/ruby-compat";
import type { WriteStream } from "@blazetrails/ruby-compat";

const CONSOLE_METHODS = new Map<
  WriteStream,
  readonly ("log" | "info" | "debug" | "warn" | "error")[]
>([
  [STDOUT, ["log", "info", "debug"]],
  [STDERR, ["warn", "error"]],
]);

type StreamIO = {
  write: WriteStream["write"];
  console: Record<string, (...args: unknown[]) => void>;
};

function dup(stream: WriteStream): StreamIO {
  const io: StreamIO = { write: stream.write, console: {} };
  for (const method of CONSOLE_METHODS.get(stream)!) io.console[method] = console[method];
  return io;
}

function reopen(stream: WriteStream, other: StreamIO | ((chunk: string) => void)): void {
  const writable = stream as { write: WriteStream["write"] };
  if (typeof other === "function") {
    writable.write = (chunk) => {
      other(chunk);
      return true;
    };
    for (const method of CONSOLE_METHODS.get(stream)!) {
      console[method] = (...args: unknown[]) => other(`${args.map(String).join(" ")}\n`);
    }
  } else {
    writable.write = other.write;
    for (const method of CONSOLE_METHODS.get(stream)!) console[method] = other.console[method];
  }
}

/** @internal */
export async function silenceStream<T>(
  stream: WriteStream,
  block: () => T | Promise<T>,
): Promise<T> {
  const oldStream = dup(stream);
  reopen(stream, () => {});
  try {
    return await block();
  } finally {
    reopen(stream, oldStream);
  }
}

/** @internal */
export async function quietly<T>(block: () => T | Promise<T>): Promise<T> {
  return silenceStream(STDOUT, () => silenceStream(STDERR, block));
}

/**
 * @internal
 * @missingRailsCall new — PERMANENT
 */
export async function capture(
  stream: string,
  block: () => unknown | Promise<unknown>,
): Promise<string> {
  stream = stream.startsWith(":") ? stream.slice(1) : stream;
  let capturedStream = "";
  const streamIo = ({ stdout: STDOUT, stderr: STDERR } as Record<string, WriteStream>)[stream];
  const originStream = dup(streamIo);
  reopen(streamIo, (chunk) => {
    capturedStream += chunk;
  });
  try {
    await block();

    return capturedStream;
  } finally {
    reopen(streamIo, originStream);
  }
}
