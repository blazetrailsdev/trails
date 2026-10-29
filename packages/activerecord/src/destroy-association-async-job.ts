import { Base as JobBase, DeserializationError, registerJob } from "@blazetrails/activejob";
import { rbFSend, StandardError } from "@blazetrails/ruby-compat";
import { queues } from "./active-record.js";
import { Base } from "./base.js";
import { computeType } from "./inheritance.js";

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
    const associationModel = computeType(Base, associationClass!);
    const ownerClass = computeType(Base, ownerModelName!);
    const owner = await ownerClass.findBy({ [ownerClass.primaryKey as string]: [ownerId] });

    if (!(await this.isOwnerDestroyed(owner, ensuringOwnerWasMethod))) {
      throw new DestroyAssociationAsyncError("owner record not destroyed");
    }

    await associationModel
      .where({ [associationPrimaryKeyColumn as string]: associationIds })
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
      !owner || (ensuringOwnerWasMethod != null && (await rbFSend(owner, ensuringOwnerWasMethod)))
    );
  }
}

registerJob("ActiveRecord::DestroyAssociationAsyncJob", DestroyAssociationAsyncJob);
