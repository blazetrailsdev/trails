import { include, OpenSSL, type Included, type Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import { Servable } from "./blob/servable.js";
import type { Blob } from "./blob.js";
import { Filename } from "./filename.js";
import type { Service } from "./service.js";
import { Variation } from "./variation.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Variant extends Included<typeof Servable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Variant {
  readonly blob: Blob;
  readonly variation: Variation;

  constructor(blob: Blob, variationOrVariationKey: Parameters<typeof Variation.wrap>[0]) {
    this.blob = blob;
    this.variation = Variation.wrap(variationOrVariationKey);
  }

  get service(): Service {
    return this.blob.service;
  }

  get content_type(): string | null {
    return this.variation.contentType;
  }

  async processed(): Promise<this> {
    if (!(await this.isProcessed())) await this.process();
    return this;
  }

  get key(): string {
    return `variants/${this.blob.key}/${OpenSSL.Digest.SHA256.hexdigest(this.variation.key)}`;
  }

  url({
    expiresIn = ActiveStorage.serviceUrlsExpireIn,
    disposition = "inline",
  }: { expiresIn?: unknown; disposition?: string } = {}): string {
    return this.service.url(this.key, {
      expiresIn: expiresIn,
      disposition: disposition,
      filename: this.filename,
      contentType: this.content_type,
    });
  }

  async download(): Promise<Uint8Array>;
  async download(block: (chunk: Uint8Array) => unknown): Promise<void>;
  async download(block?: (chunk: Uint8Array) => unknown): Promise<Uint8Array | void> {
    return await this.service.download(this.key, block);
  }

  get filename(): Filename {
    return new Filename(`${this.blob.filename.base()}.${this.variation.format.toLowerCase()}`);
  }

  get image(): this {
    return this;
  }

  async destroy(): Promise<void> {
    await this.service.delete(this.key);
  }

  /** @internal */
  private async isProcessed(): Promise<boolean> {
    return await this.service.isExist(this.key);
  }

  /** @internal */
  private async process(): Promise<void> {
    await this.blob.open({}, async (input) => {
      await this.variation.transform(input, async (output: Tempfile) => {
        await this.service.upload(this.key, output, { contentType: this.content_type });
      });
    });
  }
}

include(Variant, Servable);
