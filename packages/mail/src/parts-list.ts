import { NoMethodError, sortBy } from "@blazetrails/ruby-compat";
import { toYaml, type YAML } from "@blazetrails/ruby-compat/yaml";
import { AttachmentsList } from "./attachments-list.js";
import { Mail } from "./mail.js";

export type PartsListPart = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class PartsList extends Array<PartsListPart> {
  /** @noRailsEquivalent PERMANENT */
  static override get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  /** @missingRailsCall new — CONVERGEABLE mail-part-and-message-dependent-specs */
  constructor(...args: unknown[]) {
    super();
    if (args[0] != null) this.push(...(args[0] as unknown[]));
  }

  get parts(): this {
    return this;
  }

  encodeWith(coder: YAML.Coder): void {
    coder.representObject(null, Array.from(this));
  }

  toYaml(options: Record<string, unknown> = {}): string {
    return toYaml(Array.from(this), options);
  }

  attachments(): AttachmentsList {
    return new AttachmentsList(this);
  }

  collect(block?: (o: PartsListPart) => unknown): unknown {
    if (block !== undefined) {
      const ary = new PartsList();
      for (const o of this) ary.push(block(o));
      return ary;
    } else {
      return Array.from(this);
    }
  }

  override map<U>(block: (value: PartsListPart, index: number, array: PartsListPart[]) => U): U[] {
    return this.collect(block as (o: PartsListPart) => U) as U[];
  }

  mapBang(): never {
    throw new NoMethodError(
      "#map! is not defined, please call #collect and create a new PartsList",
    );
  }

  collectBang(): never {
    throw new NoMethodError(
      "#collect! is not defined, please call #collect and create a new PartsList",
    );
  }

  inspectStructure(parentId = ""): string {
    return Array.from(this)
      .map((part, i) => {
        i = i + 1;
        const id = parentId.length === 0 ? `${i}` : `${parentId}.${i}`;
        let subList: PartsList;
        if (part.contentType() === "message/rfc822") {
          subList = Mail.new(part.body).parts;
        } else {
          subList = part.parts;
        }
        return `${id}. ${part.inspect()}${subList.length > 0 ? `\n${subList.inspectStructure(id)}` : ""}`;
      })
      .join("\n");
  }

  recursiveEach(block: (part: PartsListPart) => void): void {
    for (const part of Array.from(this)) {
      let subList: PartsList;
      if (part.contentType() === "message/rfc822") {
        subList = Mail.new(part.body).parts;
      } else {
        subList = part.parts;
      }
      block(part);
      subList.recursiveEach(block);
    }
  }

  recursiveSize(): number {
    let i = 0;
    this.recursiveEach(() => {
      i += 1;
    });
    return i;
  }

  recursiveDeleteIf(block: (part: PartsListPart) => unknown): void {
    const kept = Array.from(this).filter((part) => {
      let subList: PartsList;
      if (part.contentType() === "message/rfc822") {
        subList = Mail.new(part.body).parts;
      } else {
        subList = part.parts;
      }
      const result = block(part);
      if (subList.length > 0) subList.recursiveDeleteIf(block);
      return result == null || result === false;
    });
    this.splice(0, this.length, ...kept);
  }

  deleteAttachments(): void {
    this.recursiveDeleteIf((part) => part.isAttachment());
  }

  override sort(): this {
    return new (this.constructor as typeof PartsList)(Array.from(this).sort()) as this;
  }

  sortBang(order: string[]): PartsListPart[] {
    let i = 0;
    const sorted = sortBy(Array.from(this), (a: PartsListPart) => {
      const value = this.getOrderValue(a, order);
      value.push((i += 1));
      return value;
    });
    this.length = 0;
    for (const p of sorted) this.push(p);
    return this;
  }

  /** @internal */
  private getOrderValue(part: PartsListPart, order: string[]): number[] {
    const isAttachment = typeof part?.isAttachment === "function" && part.isAttachment();
    const hasContentType =
      typeof part?.contentType === "function" && part.get("content_type") != null;
    const index = hasContentType
      ? order.indexOf(part.get("content_type").string.toLowerCase())
      : -1;

    return [isAttachment ? 1 : 0, index === -1 ? 10000 : index];
  }
}
