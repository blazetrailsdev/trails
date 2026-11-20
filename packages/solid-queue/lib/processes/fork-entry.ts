import { exitBang, rbForkPayload, rbForkedPipe } from "@blazetrails/ruby-compat";
import { Configuration, Process } from "../index.js";
import { ForkGuard } from "./runnable.js";

const { boot, configuredProcess, name, supervisorId } = rbForkPayload() as {
  boot: string;
  name: string;
  configuredProcess: { kind: string; attributes: Record<string, unknown> };
  supervisorId: unknown;
};

await import(boot);

const instance = new Configuration.Process(
  configuredProcess.kind,
  configuredProcess.attributes,
).instantiate() as {
  name: string;
  mode: string;
  _bootGuard: ForkGuard;
  supervisedBy(process: unknown): void;
  registerSignalHandlers(): void;
  boot(): Promise<void>;
  run(): Promise<void>;
};
instance.supervisedBy(await Process.find(supervisorId));
instance.name = name;
instance.mode = "fork";

const bootGuard = new ForkGuard();
[
  (bootGuard as unknown as { _reader: unknown })._reader,
  (bootGuard as unknown as { _writer: unknown })._writer,
] = rbForkedPipe(0);
instance._bootGuard = bootGuard;

instance.registerSignalHandlers();
await instance.boot();
await instance.run();

exitBang(0);
