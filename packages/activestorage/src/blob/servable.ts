import { ActiveStorage } from "../active-storage.js";

interface ServableHost {
  content_type: string | null;
  forciblyServeAsBinary(): boolean;
  isAllowedInline(): boolean;
}

function contentTypeForServing(this: ServableHost): string | null {
  return this.forciblyServeAsBinary() ? ActiveStorage.binaryContentType : this.content_type;
}

function forcedDispositionForServing(this: ServableHost): "attachment" | undefined {
  if (this.forciblyServeAsBinary() || !this.isAllowedInline()) {
    return "attachment";
  }
}

/** @internal */
function forciblyServeAsBinary(this: ServableHost): boolean {
  return ActiveStorage.contentTypesToServeAsBinary.includes(this.content_type!);
}

/** @internal */
function isAllowedInline(this: ServableHost): boolean {
  return ActiveStorage.contentTypesAllowedInline.includes(this.content_type!);
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
