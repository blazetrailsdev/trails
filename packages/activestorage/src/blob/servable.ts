import { ActiveStorage } from "../active-storage.js";

interface ServableHost {
  content_type?: string | null;
  contentType?: string | null;
  forciblyServeAsBinary(): boolean;
  isAllowedInline(): boolean;
}

function _contentType(host: ServableHost): string {
  return (host.content_type ?? host.contentType) as string;
}

function contentTypeForServing(this: ServableHost): string | null {
  return this.forciblyServeAsBinary() ? ActiveStorage.binaryContentType : _contentType(this);
}

function forcedDispositionForServing(this: ServableHost): "attachment" | undefined {
  if (this.forciblyServeAsBinary() || !this.isAllowedInline()) {
    return "attachment";
  }
}

/** @internal */
function forciblyServeAsBinary(this: ServableHost): boolean {
  return ActiveStorage.contentTypesToServeAsBinary.includes(_contentType(this));
}

/** @internal */
function isAllowedInline(this: ServableHost): boolean {
  return ActiveStorage.contentTypesAllowedInline.includes(_contentType(this));
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
