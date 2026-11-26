import { delegateMissingTo, isPresent } from "@blazetrails/activesupport";
import { RuntimeError, Thread, rbFSend } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Attached } from "../attached.js";
import type { Attachment } from "../app/models/active-storage/attachment.js";
import type { Blob } from "../app/models/active-storage/blob.js";
import type { CreateOne } from "./changes/create-one.js";
import { DetachOne } from "./changes/detach-one.js";
import { PurgeOne } from "./changes/purge-one.js";

type OwnMember =
  | keyof Attached
  | "purge"
  | "purgeLater"
  | "detach"
  | "attachment"
  | "load"
  | "isBlank"
  | "attach"
  | "isAttached"
  | "loadedAttachment";

type AllowNil<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R | null
    : T[K] | null;
};

type DelegatedAttachment = AllowNil<
  Omit<Attachment, OwnMember> & Omit<Blob, keyof Attachment | OwnMember>
>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface One extends DelegatedAttachment {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
    new Thread(() => attachment);
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

/** @missingRailsArgs delegate_missing_to — PERMANENT */
delegateMissingTo.call(One, "attachment", {
  allowNil: true,
  nilTargetClasses: () =>
    [ActiveStorage.Attachment!, ActiveStorage.Blob!].map((klass) => {
      klass.defineAttributeMethods();
      return klass;
    }),
});

Attached.One = One;
