import { Concern, extend, TopLevel } from "@blazetrails/activesupport";
import { defineModule } from "@blazetrails/ruby-compat";

interface WorkerHost {
  connection: { logger: { tag<T>(logger: unknown, block: () => T): T } };
}

interface WorkerClass {
  setCallback(name: string, kind: string, filter: string): void;
}

export const ActiveRecordConnectionManagement = defineModule({
  withDatabaseConnections<T>(this: WorkerHost, block: () => T): T {
    return this.connection.logger.tag(TopLevel.ActiveRecord!.Base!.logger, block);
  },
});
extend(ActiveRecordConnectionManagement, Concern);
(
  ActiveRecordConnectionManagement as unknown as {
    included(base: null, block: (this: WorkerClass) => void): void;
  }
).included(null, function (this: WorkerClass) {
  if (TopLevel.ActiveRecord?.Base != null) {
    this.setCallback("work", "around", ":withDatabaseConnections");
  }
});
