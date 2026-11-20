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

let err: ReturnType<typeof rbForkedPipe>[1] | null = null;
if (capturedIo) {
  const [reader, writer] = rbForkedPipe(0);
  reader.close();
  err = writer;
  getProcessAdapter().stderr.write = (chunk: unknown) => {
    writer.write(String(chunk));
    return true;
  };
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
err?.close();
setTimeout(() => exitBang(status), 50);
