import { delegateMissingTo, isPresent } from "@blazetrails/activesupport";
import { rbFSend } from "@blazetrails/ruby-compat";
import { Attached } from "../attached.js";
import type { Attachment } from "../attachment.js";
import type { Blob } from "../blob.js";
import type { CreateMany } from "./changes/create-many.js";
import { DetachMany } from "./changes/detach-many.js";
import { PurgeMany } from "./changes/purge-many.js";

export class Many extends Attached {
  async purge(): Promise<void> {
    await this.purgeMany().purge();
  }

  async purgeLater(): Promise<void> {
    await this.purgeMany().purgeLater();
  }

  async detach(): Promise<void> {
    await this.detachMany().detach();
  }

  /** @inventedArm if — PERMANENT */
  get attachments(): PromiseLike<Attachment[]> | Attachment[] {
    if (isPresent(this.change)) return (this.change as CreateMany).attachments;
    const attachments = rbFSend(this.record, `${this.name}Attachments`) as PromiseLike<
      Attachment[]
    >;
    return new Proxy(attachments, {
      get(target, prop) {
        if (prop === "then") {
          const loaded = target.then(async (records) => {
            for (const attachment of records) await attachment.blob;
            return records;
          });
          return loaded.then.bind(loaded);
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  get blobs(): PromiseLike<Blob[]> | Blob[] {
    return isPresent(this.change)
      ? (this.change as CreateMany).blobs
      : (rbFSend(this.record, `${this.name}Blobs`) as PromiseLike<Blob[]>);
  }

  async attach(...attachables: unknown[]): Promise<this | null> {
    await rbFSend(this.record, `${this.name}=`, [
      ...(await this.blobs),
      ...attachables.flat(Infinity),
    ]);
    if (this.record.isPersisted() && !this.record.isChanged) {
      if (!(await this.record.save())) return null;
    }
    return rbFSend(this.record, this.name) as this;
  }

  async isAttached(): Promise<boolean> {
    return (await this.attachments).length > 0;
  }

  /** @internal */
  private purgeMany(): PurgeMany {
    return new PurgeMany(this.name, this.record, this.attachments);
  }

  /** @internal */
  private detachMany(): DetachMany {
    return new DetachMany(this.name, this.record, this.attachments);
  }
}

Object.setPrototypeOf(
  Many.prototype,
  delegateMissingTo.call(
    Object.create(Object.getPrototypeOf(Many.prototype) as object),
    "attachments",
  ),
);

Attached.Many = Many;
