import type { ContentTypeField } from "./fields/content-type-field.js";
import type { Part } from "./part.js";
import { cmp, DelegateClass, NoMethodError, sortBy } from "@blazetrails/ruby-compat";
import { toYaml, type YAML } from "@blazetrails/ruby-compat/yaml";
import { AttachmentsList } from "./attachments-list.js";
import { Mail } from "./mail.js";

export type PartsListPart = Part;

export class PartsList extends (DelegateClass(Array) as new (
  obj: PartsListPart[],
) => PartsListPart[] & { __getobj__(): PartsListPart[] }) {
  declare parts: PartsListPart[];

  /** @missingRailsCall new — CONVERGEABLE mail-message-spec-port-remaining */
  constructor(...args: unknown[]) {
    let parts: PartsListPart[];
    if (typeof args[0] === "number") {
      parts = Array.from({ length: args[0] }, () => (args[1] ?? null) as PartsListPart);
    } else {
      parts = args[0] != null ? Array.from(args[0] as PartsListPart[]) : [];
    }
    super(parts);
    this.parts = parts;
  }

  encodeWith(coder: YAML.Coder): void {
    coder.representObject(null, this.parts);
  }

  toYaml(options: Record<string, unknown> = {}): string {
    return toYaml(this.parts, options);
  }

  attachments(): AttachmentsList {
    return new AttachmentsList(this.parts);
  }

  collect(block?: (o: PartsListPart) => unknown): unknown {
    if (block !== undefined) {
      const ary = new PartsList();
      for (const o of this) ary.push(block(o) as PartsListPart);
      return ary;
    } else {
      return this.parts;
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
          subList = Mail.new(part.body()).parts;
        } else {
          subList = part.parts;
        }
        return `${id}. ${part.inspect()}${subList.length > 0 ? `\n${subList.inspectStructure(id)}` : ""}`;
      })
      .join("\n");
  }

  recursiveEach(block: (part: PartsListPart) => void): void {
    for (let index = 0; index < this.length; index++) {
      const part = this[index];
      let subList: PartsList;
      if (part.contentType() === "message/rfc822") {
        subList = Mail.new(part.body()).parts;
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
    for (let index = 0; index < this.length; ) {
      const part = this[index];
      let subList: PartsList;
      if (part.contentType() === "message/rfc822") {
        subList = Mail.new(part.body()).parts;
      } else {
        subList = part.parts;
      }
      const result = block(part);
      if (subList.length > 0) subList.recursiveDeleteIf(block);
      if (result != null && result !== false) {
        this.splice(index, 1);
      } else {
        index += 1;
      }
    }
  }

  deleteAttachments(): void {
    this.recursiveDeleteIf((part) => part.isAttachment());
  }

  override sort(compareFn?: (a: PartsListPart, b: PartsListPart) => number): this {
    return new (this.constructor as typeof PartsList)(
      [...this.parts].sort(compareFn ?? ((a, b) => cmp(a, b) ?? 0)),
    ) as this;
  }

  sortBang(order: string[]): PartsListPart[] {
    let i = 0;
    const sorted = sortBy(this.parts, (a: PartsListPart) => {
      const value = this.getOrderValue(a, order);
      value.push((i += 1));
      return value;
    });
    this.parts.length = 0;
    for (const p of sorted) this.parts.push(p);
    return sorted;
  }

  /** @internal */
  private getOrderValue(part: PartsListPart, order: string[]): number[] {
    const isAttachment =
      typeof (part as Part | null)?.isAttachment === "function" && part.isAttachment();
    const hasContentType =
      typeof (part as Part | null)?.contentType === "function" && part.get("content_type") != null;
    const index = hasContentType
      ? order.indexOf(
          (part.get("content_type") as unknown as ContentTypeField).string().toLowerCase(),
        )
      : -1;

    return [isAttachment ? 1 : 0, index === -1 ? 10000 : index];
  }
}
