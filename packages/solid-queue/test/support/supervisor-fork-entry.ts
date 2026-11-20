import {
  SystemExit,
  TopLevel,
  exitBang,
  getProcessAdapter,
  rbForkPayload,
  rbForkedPipe,
} from "@blazetrails/ruby-compat";

const { boot, root, supervisorPidfile, options, capturedIo } = rbForkPayload() as {
  boot: string;
  root: string;
  supervisorPidfile: unknown;
  options: { [key: string]: unknown };
  capturedIo: boolean;
};

const pipes: ReturnType<typeof rbForkedPipe>[1][] = [];
if (capturedIo) {
  for (const [index, stream] of [
    getProcessAdapter().stdout,
    getProcessAdapter().stderr,
  ].entries()) {
    const [reader, writer] = rbForkedPipe(index);
    reader.close();
    pipes.push(writer);
    stream.write = (chunk: unknown) => {
      writer.write(String(chunk));
      return true;
    };
  }
}

await import(boot);
TopLevel.Trails!.root = () => root;
const { SolidQueue, Supervisor } = await import("../../lib/index.js");
SolidQueue.supervisorPidfile = supervisorPidfile;

let status = 0;
try {
  await Supervisor.start(options);
} catch (error) {
  if (!(error instanceof SystemExit)) throw error;
  status = error.status;
}
for (const writer of pipes) writer.close();
setTimeout(() => exitBang(status), 50);
