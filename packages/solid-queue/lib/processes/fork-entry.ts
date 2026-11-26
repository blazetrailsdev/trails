import {
  File,
  TopLevel,
  constGet,
  exitBang,
  rbForkPayload,
  rbForkedPipe,
  rbModName,
} from "@blazetrails/ruby-compat";
import { Process, RecurringTask, Scheduler } from "../index.js";
import { ForkGuard } from "./runnable.js";

const { boot, processClass, attributes, name, supervisorId } = rbForkPayload() as {
  boot: string;
  name: string;
  processClass: string;
  attributes: Record<string, unknown>;
  supervisorId: unknown;
};

await import((await File.isExistAsync(`${boot}.ts`)) ? `${boot}.ts` : `${boot}.js`);

if (processClass === rbModName(Scheduler)) {
  await RecurringTask.loadSchema();
  attributes.recurringTasks = (attributes.recurringTasks as Record<string, unknown>[]).map(
    (task) => new RecurringTask(task),
  );
}

const instance = new (constGet(TopLevel, processClass) as new (
  attributes: Record<string, unknown>,
) => object)(attributes) as {
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
