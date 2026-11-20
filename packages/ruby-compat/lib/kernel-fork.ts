import { getChildProcess } from "./child-process-adapter.js";
import { children, terminated } from "./fork-children.js";
import { IO, pipeWriterDup, type PipeIO } from "./io.js";
import { env as processEnv } from "./process-adapter.js";

const FORK_ENV = "RUBY_COMPAT_FORK";

interface PipeMessage {
  rubyCompatPipe: number;
  data?: number[];
}

/**
 * `Kernel#fork` (`rb_f_fork`, `vendor/ruby/v3.3.11/process.c:4375`) over
 * `child_process.fork`. A Node child starts on a fresh heap rather than a copy
 * of the parent's, so it cannot run the parent's block: it runs `entry`, which
 * reads `payload` back with {@link rbForkPayload}. Each of `pipes` is a writer
 * the child holds a copy of, reached there as {@link rbForkedPipe}. Answers
 * the child's pid, which {@link rbWaitpidNohang} reports once it exits.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#fork`.
 */
export function rbFFork(entry: string, payload: unknown, pipes: PipeIO[] = []): number {
  const copies = pipes.map((writer) => pipeWriterDup(writer));
  const pid = getChildProcess().fork!(
    entry,
    { ...processEnv, [FORK_ENV]: JSON.stringify(payload ?? null) },
    (message) => {
      const { rubyCompatPipe, data } = (message ?? {}) as PipeMessage;
      const copy = copies[rubyCompatPipe];
      if (copy === undefined) return;
      if (data === undefined) copy.close();
      else copy.write(Uint8Array.from(data));
    },
    (status) => {
      for (const copy of copies) copy.close();
      terminated.push(status);
    },
  );
  children.add(pid);
  return pid;
}

/**
 * What {@link rbFFork} handed this process, or `null` outside a forked child:
 * the part of the heap `rb_fork_ruby` (`vendor/ruby/v3.3.11/process.c:4249`)
 * would have copied that the child needs.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#fork`.
 */
export function rbForkPayload(): unknown {
  const payload = processEnv[FORK_ENV];
  return payload == null ? null : JSON.parse(payload);
}

/**
 * The child's copy of the `index`th pipe {@link rbFFork} was handed: a reader
 * of its own, closed apart from the parent's, and a writer whose bytes reach
 * the parent's reader, as `rb_fork_ruby` (`vendor/ruby/v3.3.11/process.c:4249`)
 * leaves the child both descriptors of every pipe.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#fork`.
 */
export function rbForkedPipe(index: number): [PipeIO, PipeIO] {
  const proc = (globalThis as { process?: { send?(message: PipeMessage): unknown } }).process;
  const [reader] = IO.pipe();
  const [, writer] = IO.pipe();
  const pipe = (writer as unknown as { _pipe: ForkedPipeBuffer })._pipe;
  const pump = (): void => {
    for (const chunk of pipe.chunks.splice(0)) {
      proc?.send?.({ rubyCompatPipe: index, data: Array.from(chunk) });
    }
    pipe.length = 0;
    if (pipe.writerClosed) proc?.send?.({ rubyCompatPipe: index });
    else pipe.waiting.push(pump);
  };
  pipe.waiting.push(pump);
  return [reader, writer];
}

interface ForkedPipeBuffer {
  chunks: Uint8Array[];
  length: number;
  writerClosed: boolean;
  waiting: (() => void)[];
}
