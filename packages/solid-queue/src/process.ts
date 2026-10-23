import { registerModel, type Relation } from "@blazetrails/activerecord";
import { include, isPresent, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Record } from "./record.js";
import { SolidQueue } from "./solid-queue.js";
import { Executor } from "./process/executor.js";

export class Process extends Record {
  declare kind: string;
  declare name: string;
  declare pid: number;
  declare hostname: string | null;
  declare metadata: HashWithIndifferentAccess;
  declare last_heartbeat_at: Time;
  declare supervisor_id: unknown;
  declare supervisees: Relation<Process>;
  declare failAllClaimedExecutionsWith: typeof Executor.prototype.failAllClaimedExecutionsWith;
  declare releaseAllClaimedExecutions: typeof Executor.prototype.releaseAllClaimedExecutions;

  static {
    registerModel(this);

    include(this, Executor);

    this.belongsTo("supervisor", {
      className: "Process",
      optional: true,
      inverseOf: "supervisees",
    });
    this.hasMany("supervisees", {
      className: "Process",
      inverseOf: "supervisor",
      foreignKey: "supervisor_id",
    });

    this.store("metadata", { coder: JSON });
  }

  static async register(attributes: { [key: string]: unknown }): Promise<Process> {
    return await SolidQueue.instrument("register_process", attributes, async (payload) => {
      try {
        const process = await this.createBang({
          ...attributes,
          last_heartbeat_at: Time.current(),
        });
        payload.process_id = process.id;
        return process;
      } catch (error) {
        payload.error = error;
        throw error;
      }
    });
  }

  async heartbeat(): Promise<void> {
    this.restoreAttributes();
    await this.withLock(async () => {
      await this.touch("last_heartbeat_at");
    });
  }

  async deregister({ pruned = false }: { pruned?: boolean } = {}): Promise<void> {
    await SolidQueue.instrument(
      "deregister_process",
      { process: this, pruned: pruned },
      async (payload) => {
        try {
          await this.destroyBang();

          if (!(this.isSupervised() || pruned)) {
            for (const supervisee of await this.supervisees.toArray()) {
              await supervisee.deregister();
            }
          }
        } catch (error) {
          payload.error = error;
          throw error;
        }
      },
    );
  }

  /** @internal */
  private isSupervised(): boolean {
    return isPresent(this.supervisor_id);
  }
}
