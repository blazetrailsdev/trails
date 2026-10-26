import { Concern, extend } from "@blazetrails/activesupport";
import { TimerTask, classModule } from "@blazetrails/ruby-compat";
import { ClaimedExecution } from "../claimed-execution.js";
import { Process } from "../process.js";
import { ProcessMissingError } from "../processes/process-missing-error.js";
import { SolidQueue } from "../solid-queue.js";

interface MaintenanceHost {
  _maintenanceTask?: TimerTask;
  process: Process | null;
  wrapInAppExecutor<T>(block: () => T): T;
  handleThreadError(error: unknown): void;
  pruneDeadProcesses(): Promise<void>;
}

export class Maintenance {
  static readonly [classModule] = true;

  /** @internal */
  launchMaintenanceTask(this: MaintenanceHost): void {
    this._maintenanceTask = new TimerTask(
      { runNow: true, executionInterval: Number(SolidQueue.processAliveThreshold) },
      () => this.pruneDeadProcesses(),
    );

    this._maintenanceTask.addObserver((_, __, error) => {
      if (error != null) this.handleThreadError(error);
    });

    this._maintenanceTask.execute();
  }

  /** @internal */
  stopMaintenanceTask(this: MaintenanceHost): void {
    this._maintenanceTask?.shutdown();
  }

  /** @internal */
  async pruneDeadProcesses(this: MaintenanceHost): Promise<void> {
    await this.wrapInAppExecutor(() => Process.prune({ excluding: this.process }));
  }

  /** @internal */
  async failOrphanedExecutions(this: MaintenanceHost): Promise<void> {
    await this.wrapInAppExecutor(() =>
      (ClaimedExecution.orphaned() as unknown as typeof ClaimedExecution).failAllWith(
        new ProcessMissingError(),
      ),
    );
  }
}
extend(Maintenance, Concern);
(
  Maintenance as unknown as {
    included(base: null, block: (this: { afterBoot(name: string): void }) => void): void;
  }
).included(null, function () {
  this.afterBoot(":failOrphanedExecutions");
});
