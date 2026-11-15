import { Open3, STDOUT as $stdout, Thread, type Process } from "@blazetrails/ruby-compat";

type CaptureResult = [string, string, InstanceType<typeof Process.Status>];

type LineReader = { getsAsync(): Promise<string | null> };

export const IO = {
  async capture(...cmd: unknown[]): Promise<CaptureResult> {
    const {
      withOutput = (line: string) => $stdout.puts(line),
      stdinData = "",
      ...opts
    } = (cmd.pop() ?? {}) as {
      withOutput?: ((line: string) => unknown) | null;
      stdinData?: string;
    } & Record<string, unknown>;
    if (!withOutput) return (await Open3.capture3(...cmd, opts)) as CaptureResult;

    return Open3.popen3(...cmd, opts, async (stdin, stdout, stderr, waitThreads) => {
      stdin.write(stdinData);
      stdin.close();
      const out = new Thread(() => IO.readLines(stdout, withOutput));
      const err = new Thread(() => stderr.readAsync());
      return [
        await out.value(),
        new TextDecoder().decode((await err.value()) as Uint8Array),
        await waitThreads.value(),
      ] as CaptureResult;
    });
  },

  async readLines(io: LineReader, block: (line: string) => unknown): Promise<string> {
    let buffer = "";
    let line: string | null;
    while ((line = await io.getsAsync()) !== null) {
      buffer += line;
      block(line);
    }
    return buffer;
  },
};
