import { isPresent } from "@blazetrails/activesupport";
import { KERNEL_METHODS, PROTOCOL_PROBES, rbFSend } from "@blazetrails/ruby-compat";
import { Attached } from "../attached.js";
import type { Attachment } from "../attachment.js";
import type { CreateOne } from "./changes/create-one.js";
import { DetachOne } from "./changes/detach-one.js";
import { PurgeOne } from "./changes/purge-one.js";

export class One extends Attached {
  async purge(): Promise<void> {
    await (await this.purgeOne()).purge();
  }

  async purgeLater(): Promise<void> {
    await (await this.purgeOne()).purgeLater();
  }

  async detach(): Promise<void> {
    await (await this.detachOne()).detach();
  }

  /** @inventedArm if — PERMANENT */
  get attachment(): Attachment | null | Promise<Attachment | null> {
    if (isPresent(this.change)) return (this.change as CreateOne).attachment;
    const attachment = rbFSend(this.record, `${this.name}Attachment`) as
      | Attachment
      | null
      | Promise<Attachment | null>;
    if (attachment instanceof Promise) {
      return attachment.then(async (record) => {
        await record?.blob;
        return record;
      });
    }
    const blob = attachment?.blob;
    return blob instanceof Promise ? blob.then(() => attachment) : attachment;
  }

  async isBlank(): Promise<boolean> {
    return !(await this.isAttached());
  }

  async attach(attachable: unknown): Promise<this | null> {
    await rbFSend(this.record, `${this.name}=`, attachable);
    if (this.record.isPersisted() && !this.record.isChanged) {
      if (!(await this.record.save())) return null;
    }
    return rbFSend(this.record, this.name) as this;
  }

  async isAttached(): Promise<boolean> {
    return isPresent(
      await (isPresent(this.change)
        ? (this.change as CreateOne).attachment
        : rbFSend(this.record, `${this.name}Attachment`)),
    );
  }

  /** @internal */
  private async purgeOne(): Promise<PurgeOne> {
    return new PurgeOne(this.name, this.record, await this.attachment);
  }

  /** @internal */
  private async detachOne(): Promise<DetachOne> {
    return new DetachOne(this.name, this.record, await this.attachment);
  }
}

Object.setPrototypeOf(
  One.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(One.prototype) as object) as object, {
    get(target, prop, receiver: One) {
      const value = Reflect.get(target, prop, receiver);
      if (
        value !== undefined ||
        typeof prop === "symbol" ||
        prop.startsWith("_") ||
        Reflect.has(target, prop) ||
        PROTOCOL_PROBES.has(prop) ||
        KERNEL_METHODS.has(prop) ||
        receiver === One.prototype
      ) {
        return value;
      }
      const attachment = receiver.attachment as unknown as { [k: string]: unknown } | null;
      if (attachment == null || attachment instanceof Promise) return value;
      const member = attachment[prop];
      return typeof member === "function" ? member.bind(attachment) : member;
    },
  }),
);

Attached.One = One;
