import { Pathname } from "@blazetrails/ruby-compat";
import { inquiry, seconds } from "@blazetrails/activesupport";
import {
  SystemExit,
  TopLevel,
  constGet,
  exitBang,
  getProcessAdapter,
  rbForkPayload,
  rbForkedPipe,
} from "@blazetrails/ruby-compat";

const { boot, root, supervisorPidfile, forkBootTimeout, configuration, options, capturedIo } =
  rbForkPayload() as {
    boot: string;
    root: string;
    supervisorPidfile: string | null;
    forkBootTimeout: number;
    configuration: {
      configuredProcesses: { processClass: string; attributes: object }[];
      mode: string;
    } | null;
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
TopLevel.Trails!.root = () => new Pathname(root);
const { ForkSupervisor, SolidQueue, Supervisor } = await import("../../lib/index.js");
SolidQueue.supervisorPidfile = supervisorPidfile;
SolidQueue.forkBootTimeout = seconds(forkBootTimeout);

let status = 0;
try {
  if (configuration === null) await Supervisor.start(options);
  else {
    const configuredProcesses = configuration.configuredProcesses.map(
      ({ processClass, attributes }) => ({
        processClass: constGet(TopLevel, processClass) as new (attributes: object) => object,
        attributes,
        instantiate() {
          return new this.processClass(this.attributes);
        },
      }),
    );
    await new (ForkSupervisor as unknown as new (configuration: object) => {
      start(): Promise<void>;
    })({
      configuredProcesses: () => configuredProcesses,
      mode: () => inquiry.call(configuration.mode),
      isStandalone: () => true,
    }).start();
  }
} catch (error) {
  if (!(error instanceof SystemExit)) throw error;
  status = error.status;
}
for (const writer of pipes) writer.close();
setTimeout(() => exitBang(status), 50);
