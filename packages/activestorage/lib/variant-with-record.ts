import { Base } from "@blazetrails/activerecord";
import { writingRole } from "@blazetrails/activerecord/active-record";
import { isPresent } from "@blazetrails/activesupport";
import { include, type Included, type Tempfile } from "@blazetrails/ruby-compat";
import type { One } from "./attached/one.js";
import { Servable } from "./blob/servable.js";
import type { Blob } from "./blob.js";
import { Filename } from "./filename.js";
import type { Service } from "./service.js";
import type { VariantRecord } from "./variant-record.js";
import { Variation } from "./variation.js";

type Image = {
  io: Tempfile;
  filename: string;
  contentType: string | null;
  serviceName: string | null | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface VariantWithRecord extends Included<typeof Servable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class VariantWithRecord {
  readonly blob: Blob;
  readonly variation: Variation;
  private _record: VariantRecord | null = null;

  constructor(blob: Blob, variation: Parameters<typeof Variation.wrap>[0]) {
    this.blob = blob;
    this.variation = Variation.wrap(variation);
  }

  get service(): Service {
    return this.blob.service;
  }

  get contentType(): string | null {
    return this.variation.contentType;
  }

  async processed(): Promise<this> {
    if (!(await this.isProcessed())) await this.process();
    return this;
  }

  /** @inventedArm load — PERMANENT */
  get image(): Promise<One | null> {
    return this.record().then(async (record) => {
      const image = record?.image ?? null;
      await image?.load();
      await (
        await image?.attachment
      )?.blob;
      return image;
    });
  }

  get filename(): Filename {
    return new Filename(`${this.blob.filename.base()}.${this.variation.format.toLowerCase()}`);
  }

  async destroy(): Promise<void> {
    await (await this.record())?.destroy();
  }

  get key(): Promise<string | null> {
    return this.image.then((image) => (image as { key?: string } | null)?.key ?? null);
  }

  async url(options?: { [k: string]: unknown }): Promise<string | null> {
    const image = (await this.image) as (One & Pick<Blob, "url">) | null;
    return image?.url(options) ?? null;
  }

  async download(block?: (chunk: Uint8Array) => unknown): Promise<Uint8Array | void | null> {
    const image = (await this.image) as (One & Pick<Blob, "download">) | null;
    return (await image?.download(block as never)) ?? null;
  }

  /** @internal */
  private async isProcessed(): Promise<boolean> {
    return isPresent(await this.record());
  }

  /** @internal */
  private async process(): Promise<void> {
    await this.transformBlob((image) => this.createOrFindRecord({ image: image }));
  }

  /** @internal */
  private async transformBlob(block: (image: Image) => unknown): Promise<void> {
    await this.blob.open({}, async (input) => {
      await this.variation.transform(input, async (output: Tempfile) => {
        await block({
          io: output,
          filename: `${this.blob.filename.base()}.${this.variation.format.toLowerCase()}`,
          contentType: this.variation.contentType,
          serviceName: this.blob.service.name,
        });
      });
    });
  }

  /** @internal */
  private async createOrFindRecord({ image }: { image: Image }): Promise<void> {
    this._record = await Base.connectedTo({ role: writingRole() }, async () => {
      return (await this.blob.variantRecords.createOrFindByBang(
        { variation_digest: this.variation.digest },
        ((record: VariantRecord) => record.image.attach(image)) as never,
      )) as VariantRecord;
    });
  }

  /** @internal */
  private async record(): Promise<VariantRecord | null> {
    return (this._record ??= this.blob.variantRecords.isLoaded
      ? ((await this.blob.variantRecords.toArray()).find(
          (v) => v.variation_digest === this.variation.digest,
        ) ?? null)
      : ((await this.blob.variantRecords.findBy({
          variation_digest: this.variation.digest,
        })) ?? null));
  }
}

include(VariantWithRecord, Servable);
