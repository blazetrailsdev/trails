import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";

function contentTypeForServing(this: Blob): string | null {
  return this.forciblyServeAsBinary() ? ActiveStorage.binaryContentType : this.content_type;
}

function forcedDispositionForServing(this: Blob): "attachment" | undefined {
  if (this.forciblyServeAsBinary() || !this.isAllowedInline()) {
    return "attachment";
  }
}

/** @internal */
function forciblyServeAsBinary(this: Blob): boolean {
  return ActiveStorage.contentTypesToServeAsBinary.includes(this.content_type!);
}

/** @internal */
function isAllowedInline(this: Blob): boolean {
  return ActiveStorage.contentTypesAllowedInline.includes(this.content_type!);
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
