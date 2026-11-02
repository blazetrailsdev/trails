import { ActiveStorage } from "../active-storage.js";

interface ServableHost {
  contentType: string | null;
  forciblyServeAsBinary(): boolean;
  isAllowedInline(): boolean;
}

function contentTypeForServing(this: ServableHost): string | null {
  return this.forciblyServeAsBinary() ? ActiveStorage.binaryContentType : this.contentType;
}

function forcedDispositionForServing(this: ServableHost): "attachment" | undefined {
  if (this.forciblyServeAsBinary() || !this.isAllowedInline()) {
    return "attachment";
  }
}

/** @internal */
function forciblyServeAsBinary(this: ServableHost): boolean {
  return ActiveStorage.contentTypesToServeAsBinary.includes(this.contentType!);
}

/** @internal */
function isAllowedInline(this: ServableHost): boolean {
  return ActiveStorage.contentTypesAllowedInline.includes(this.contentType!);
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
