import { isPresent } from "@blazetrails/activesupport";
import { KERNEL_METHODS, PROTOCOL_PROBES, RuntimeError, rbFSend } from "@blazetrails/ruby-compat";
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

  get attachment(): Attachment | null | Promise<Attachment | null> {
    return isPresent(this.change)
      ? (this.change as CreateOne).attachment
      : (rbFSend(this.record, `${this.name}Attachment`) as
          | Attachment
          | null
          | Promise<Attachment | null>);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async load(): Promise<void> {
    await this.attachment;
  }

  isBlank(): boolean {
    return !this.isAttached();
  }

  async attach(attachable: unknown): Promise<this | null> {
    await rbFSend(this.record, `${this.name}=`, attachable);
    if (this.record.isPersisted() && !this.record.isChanged) {
      if (!(await this.record.save())) return null;
    }
    return rbFSend(this.record, this.name) as this;
  }

  isAttached(): boolean {
    return isPresent(this.loadedAttachment("attached?"));
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  loadedAttachment(method: string): Attachment | null {
    const attachment = this.attachment;
    if (!(attachment instanceof Promise)) return attachment;
    void attachment.catch(() => {});
    throw new RuntimeError(
      `${method} needs ${this.name}'s attachment loaded; \`await ${this.name}.load()\` first.`,
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
      const attachment = receiver.loadedAttachment(prop) as unknown as {
        [k: string]: unknown;
      } | null;
      if (attachment == null) return value;
      const member = attachment[prop];
      return typeof member === "function" ? member.bind(attachment) : member;
    },
  }),
);

Attached.One = One;
