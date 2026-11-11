import "./constants.destroy-association-async-job.generated.js";
import { constantize } from "@blazetrails/activesupport";
import { Base as JobBase, DeserializationError } from "@blazetrails/activejob";
import { rbFSend, StandardError } from "@blazetrails/ruby-compat";
import { queues } from "./active-record.js";
import { Base } from "./base.js";
import { ActiveRecord } from "./namespaces.js";

export class DestroyAssociationAsyncError extends StandardError {}

export class DestroyAssociationAsyncJob extends JobBase {
  static {
    this.queueAs(null, () => queues()["destroy"]);

    this.discardOn(DeserializationError);
  }

  async perform({
    ownerModelName = null,
    ownerId = null,
    associationClass = null,
    associationIds = null,
    associationPrimaryKeyColumn = null,
    ensuringOwnerWasMethod = null,
  }: {
    ownerModelName?: string | null;
    ownerId?: unknown;
    associationClass?: string | null;
    associationIds?: unknown[] | null;
    associationPrimaryKeyColumn?: string | string[] | null;
    ensuringOwnerWasMethod?: string | null;
  } = {}): Promise<void> {
    const associationModel = constantize(associationClass!) as typeof Base;
    const ownerClass = constantize(ownerModelName!) as typeof Base;
    const owner = await ownerClass.findBy(new Map([[ownerClass.primaryKey, [ownerId]]]));

    if (!(await this.isOwnerDestroyed(owner, ensuringOwnerWasMethod))) {
      throw new DestroyAssociationAsyncError("owner record not destroyed");
    }

    await associationModel
      .where(new Map([[associationPrimaryKeyColumn, associationIds]]))
      .findEach({}, async (r) => {
        await r.destroy();
      });
  }

  /** @internal */
  private async isOwnerDestroyed(
    owner: Base | null,
    ensuringOwnerWasMethod: string | null,
  ): Promise<unknown> {
    return (
      !owner ||
      (ensuringOwnerWasMethod != null &&
        !([null, undefined, false] as unknown[]).includes(
          await rbFSend(owner, ensuringOwnerWasMethod),
        ))
    );
  }
}

ActiveRecord.DestroyAssociationAsyncJob = DestroyAssociationAsyncJob;
