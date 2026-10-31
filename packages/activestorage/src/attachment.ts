import { type Base } from "@blazetrails/activerecord";
import { delegate, delegateMissingTo, runLoadHooks } from "@blazetrails/activesupport";
import { ArgumentError, block, fetch } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import type { Blob } from "./blob.js";
import type { NamedVariant } from "./named-variant.js";
import { Record } from "./record.js";

type Transformations = string | { [k: string]: unknown };

interface AttachmentReflection {
  options?: { dependent?: unknown };
  namedVariants?: { [k: string]: NamedVariant };
}

interface AttachedBlob extends Blob {
  isAnalyzed(): unknown;
  analyzeLater(): Promise<void>;
  variant(transformations: unknown): unknown;
  preview(transformations: unknown): unknown;
  representation(transformations: unknown): unknown;
  isPreviewImageNeededBeforeProcessingVariants(): boolean;
  createPreviewImageLater(variations: unknown[]): Promise<void>;
  preprocessed(transformations: unknown): Promise<void>;
}

type AttachedRecord = Base & {
  attachmentReflections: { [k: string]: AttachmentReflection | undefined };
};

export class Attachment extends Record {
  declare name: string;
  declare blob_id: number | string;
  declare record: AttachedRecord | null | Promise<AttachedRecord | null>;
  declare blob: AttachedBlob | null | Promise<AttachedBlob | null>;
  declare static withAllVariantRecords: () => unknown;

  static {
    this.belongsTo("record", { polymorphic: true, touch: ActiveStorage.touchAttachmentRecords });
    this.belongsTo("blob", { className: "Blob", autosave: true, inverseOf: "attachments" });

    this.afterCreateCommit(":mirrorBlobLater", ":analyzeBlobLater", ":transformVariantsLater");
    this.afterDestroyCommit(":purgeDependentBlobLater");

    this.scope("withAllVariantRecords", function () {
      return this.includes({
        blob: {
          variantRecords: { imageAttachment: "blob" },
          previewImageAttachment: { blob: { variantRecords: { imageAttachment: "blob" } } },
        },
      });
    });
  }

  async purge(): Promise<void> {
    await this.transaction(async () => {
      await this.delete();
      const record = await this.record;
      if (record?.isPersisted()) await record.touch();
    });
    await (await this.blob)?.purge();
  }

  async purgeLater(): Promise<void> {
    await this.transaction(async () => {
      await this.delete();
      const record = await this.record;
      if (record?.isPersisted()) await record.touch();
    });
    await (await this.blob)?.purgeLater();
  }

  async variant(transformations: Transformations): Promise<unknown> {
    transformations = await this.transformationsByName(transformations);
    return (await this.blob)!.variant(transformations);
  }

  async preview(transformations: Transformations): Promise<unknown> {
    transformations = await this.transformationsByName(transformations);
    return (await this.blob)!.preview(transformations);
  }

  async representation(transformations: Transformations): Promise<unknown> {
    transformations = await this.transformationsByName(transformations);
    return (await this.blob)!.representation(transformations);
  }

  /** @internal */
  private async analyzeBlobLater(): Promise<void> {
    const blob = (await this.blob)!;
    if (!blob.isAnalyzed()) await blob.analyzeLater();
  }

  /** @internal */
  private async mirrorBlobLater(): Promise<void> {
    await (await this.blob)!.mirrorLater();
  }

  /** @internal */
  private async transformVariantsLater(): Promise<void> {
    const record = await this.record;
    const preprocessedVariations = Object.values(await this.namedVariants())
      .filter((namedVariant) => namedVariant.isPreprocessed(record))
      .map((namedVariant) => namedVariant.transformations);

    const blob = (await this.blob)!;
    if (blob.isPreviewImageNeededBeforeProcessingVariants() && preprocessedVariations.length > 0) {
      await blob.createPreviewImageLater(preprocessedVariations);
    } else {
      for (const transformations of preprocessedVariations) {
        await blob.preprocessed(transformations);
      }
    }
  }

  /** @internal */
  private async purgeDependentBlobLater(): Promise<void> {
    if ((await this.dependent()) === "purge_later") await (await this.blob)?.purgeLater();
  }

  /** @internal */
  private async dependent(): Promise<unknown> {
    const record = (await this.record)!;
    const options = record.attachmentReflections[this.name]?.options;
    return options == null ? null : fetch(options, "dependent", null);
  }

  /** @internal */
  private async namedVariants(): Promise<{ [k: string]: NamedVariant }> {
    const record = (await this.record)!;
    return record.attachmentReflections[this.name]?.namedVariants ?? {};
  }

  /** @internal */
  private async transformationsByName(transformations: Transformations) {
    if (typeof transformations === "string") {
      const variantName = transformations;
      return fetch<NamedVariant>(
        await this.namedVariants(),
        variantName,
        block(() => {
          const record = this.association("record").target as AttachedRecord;
          const recordModelName = record.toModel().modelName.name;
          throw new ArgumentError(
            `Cannot find variant :${variantName} for ${recordModelName}#${this.name}`,
          );
        }),
      ).transformations;
    } else {
      return transformations;
    }
  }
}

Object.setPrototypeOf(
  Attachment.prototype,
  delegateMissingTo.call(
    Object.create(Object.getPrototypeOf(Attachment.prototype) as object),
    "blob",
  ),
);
delegate.call(Attachment.prototype, "signedId", { to: "blob" });

ActiveStorage.Attachment = Attachment;

runLoadHooks("active_storage_attachment", Attachment);
