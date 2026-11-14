import { Open3, STDOUT as $stdout, StringIO, type Process } from "@blazetrails/ruby-compat";

type CaptureResult = [string, string, InstanceType<typeof Process.Status>];

export const IO = {
  /** @inventedArm capture3 — CONVERGEABLE ruby-compat-open3-popen3-streams-lines */
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

    const [stdout, stderr, waitThreads] = await Open3.capture3(...cmd, { stdinData, ...opts });
    const out = IO.readLines(new StringIO(String(stdout)), withOutput);
    return [out, String(stderr), waitThreads];
  },

  readLines(io: StringIO, block: (line: string) => unknown): string {
    let buffer = "";
    let line: string | null;
    while ((line = io.gets()) !== null) {
      buffer += line;
      block(line);
    }
    return buffer;
  },
};
