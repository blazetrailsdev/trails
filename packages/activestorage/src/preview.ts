import { Base } from "@blazetrails/activerecord";
import { writingRole } from "@blazetrails/activerecord/active-record";
import { isPresent } from "@blazetrails/activesupport";
import { include, StandardError, type Included } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import type { Attachment } from "./attachment.js";
import type { One } from "./attached/one.js";
import { Servable } from "./blob/servable.js";
import type { Blob } from "./blob.js";
import type { Filename } from "./filename.js";
import type { Variant } from "./variant.js";
import type { VariantWithRecord } from "./variant-with-record.js";
import { Variation } from "./variation.js";

class UnprocessedError extends StandardError {}

interface Presented {
  filename: Filename;
  contentType: string | null;
  key: string | null | Promise<string | null>;
  url(options?: never): unknown;
  download(block?: (chunk: Uint8Array) => unknown): Promise<Uint8Array | void | null>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Preview extends Included<typeof Servable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Preview {
  static readonly UnprocessedError = UnprocessedError;

  readonly blob: Blob;
  readonly variation: Variation;

  constructor(blob: Blob, variationOrVariationKey: Parameters<typeof Variation.wrap>[0]) {
    this.blob = blob;
    this.variation = Variation.wrap(variationOrVariationKey);
  }

  /** @inventedArm isProcessed — PERMANENT */
  get filename(): Promise<Filename> {
    return this.isProcessed()
      .then(() => this.presentation())
      .then((presentation) => presentation.filename);
  }

  /** @inventedArm isProcessed — PERMANENT */
  get contentType(): Promise<string | null> {
    return this.isProcessed()
      .then(() => this.presentation())
      .then((presentation) => presentation.contentType);
  }

  async processed(): Promise<this> {
    if (!(await this.isProcessed())) await this.process();
    if (this.isVariant()) await (await this.variant()).processed();
    return this;
  }

  get image(): One {
    return this.blob.previewImage;
  }

  async url(options: Parameters<Blob["url"]>[0] = {}): Promise<unknown> {
    if (await this.isProcessed()) {
      return await (await this.presentation()).url(options as never);
    } else {
      throw new UnprocessedError();
    }
  }

  async key(): Promise<string | null> {
    if (await this.isProcessed()) {
      return await (
        await this.presentation()
      ).key;
    } else {
      throw new UnprocessedError();
    }
  }

  async download(block?: (chunk: Uint8Array) => unknown): Promise<Uint8Array | void | null> {
    if (await this.isProcessed()) {
      return await (await this.presentation()).download(block);
    } else {
      throw new UnprocessedError();
    }
  }

  /**
   * @internal
   * @inventedArm load — PERMANENT
   */
  private async isProcessed(): Promise<boolean> {
    await this.image.load();
    await (
      await this.image.attachment
    )?.blob;
    return this.image.isAttached();
  }

  /** @internal */
  private async process(): Promise<void> {
    await this.previewer().preview({ serviceName: this.blob.service_name }, async (attachable) => {
      await Base.connectedTo({ role: writingRole() }, async () => {
        await this.image.attach(attachable);
      });
    });
  }

  /** @internal */
  private async variant(): Promise<Variant | VariantWithRecord> {
    return (await (this.image as One & Pick<Attachment, "variant">).variant(
      this.variation as never,
    )) as Variant | VariantWithRecord;
  }

  /** @internal */
  private isVariant(): boolean {
    return isPresent(this.variation.transformations);
  }

  /**
   * @internal
   * @inventedArm isProcessed — PERMANENT
   */
  private async presentation(): Promise<Presented> {
    await this.isProcessed();
    return (this.isVariant()
      ? await (await this.variant()).processed()
      : this.image) as unknown as Presented;
  }

  /** @internal */
  private previewer() {
    return new (this.previewerClass())(this.blob);
  }

  /** @internal */
  private previewerClass() {
    return ActiveStorage.previewers.find((klass) => klass.isAccept(this.blob))!;
  }
}

include(Preview, Servable);
