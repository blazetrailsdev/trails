import { isPresent } from "@blazetrails/activesupport";
import { Marcel } from "@blazetrails/marcel";
import { included } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";
import { InvariableError, UnpreviewableError, UnrepresentableError } from "../errors.js";
import { TransformJob } from "../transform-job.js";
import { VariantWithRecord } from "../variant-with-record.js";
import { Variant } from "../variant.js";
import { Variation } from "../variation.js";

type Transformations = Parameters<typeof Variation.wrap>[0];

function variant(this: Blob, transformations: Transformations): Variant | VariantWithRecord {
  if (this.isVariable()) {
    return new (this.variantClass())(
      this,
      Variation.wrap(transformations).defaultTo(this.defaultVariantTransformations()),
    );
  } else {
    throw new InvariableError(
      `Can't transform blob with ID=${this.id} and content_type=${this.content_type}`,
    );
  }
}

function isVariable(this: Blob): boolean {
  return ActiveStorage.variableContentTypes.includes(this.content_type!);
}

function preview(this: Blob, transformations: Transformations) {
  if (this.isPreviewable()) {
    return new ActiveStorage.Preview!(this, transformations);
  } else {
    throw new UnpreviewableError(
      `No previewer found for blob with ID=${this.id} and content_type=${this.content_type}`,
    );
  }
}

function isPreviewable(this: Blob): boolean {
  return ActiveStorage.previewers.some((klass) => klass.isAccept(this));
}

function representation(this: Blob, transformations: Transformations) {
  if (this.isPreviewable()) {
    return this.preview(transformations);
  } else if (this.isVariable()) {
    return this.variant(transformations);
  } else {
    throw new UnrepresentableError(
      `No previewer found and can't transform blob with ID=${this.id} and content_type=${this.content_type}`,
    );
  }
}

function isRepresentable(this: Blob): boolean {
  return this.isVariable() || this.isPreviewable();
}

/** @internal */
async function isPreviewImageNeededBeforeProcessingVariants(this: Blob): Promise<boolean> {
  if (!this.isPreviewable()) return false;
  await this.previewImage.load();
  return !this.previewImage.isAttached();
}

/** @internal */
async function createPreviewImageLater(this: Blob, variations: unknown[]): Promise<void> {
  if (this.isRepresentable()) await ActiveStorage.PreviewImageJob!.performLater(this, variations);
}

/** @internal */
async function preprocessed(this: Blob, transformations: Transformations): Promise<void> {
  if (this.isRepresentable()) await TransformJob.performLater(this, transformations);
}

/** @internal */
function defaultVariantTransformations(this: Blob): { format: string } {
  return { format: this.defaultVariantFormat() };
}

/** @internal */
function defaultVariantFormat(this: Blob): string {
  if (this.isWebImage()) {
    return this.format() ?? "png";
  } else {
    return "png";
  }
}

/** @internal */
function format(this: Blob): string | null {
  if (
    isPresent(this.filename.extension()) &&
    Marcel.MimeType.for(null, { extension: this.filename.extension() }) === this.content_type
  ) {
    return this.filename.extension();
  } else {
    return new Marcel.Magic(String(this.content_type ?? "")).extensions()[0] ?? null;
  }
}

/** @internal */
function variantClass(this: Blob) {
  return ActiveStorage.trackVariants ? VariantWithRecord : Variant;
}

export const Representable = {
  variant,
  isVariable,
  preview,
  isPreviewable,
  representation,
  isRepresentable,
  isPreviewImageNeededBeforeProcessingVariants,
  createPreviewImageLater,
  preprocessed,
  defaultVariantTransformations,
  defaultVariantFormat,
  format,
  variantClass,
};

Object.defineProperty(Representable, included, {
  value(base: typeof Blob) {
    base.hasMany("variantRecords", {
      className: "ActiveStorage::VariantRecord",
      dependent: false as never,
    });
    base.beforeDestroy(async (blob: Blob) => {
      if (ActiveStorage.trackVariants) await blob.variantRecords.destroyAll();
    });
  },
});
