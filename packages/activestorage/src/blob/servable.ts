import { ActiveStorage } from "../active-storage.js";

interface ServableHost {
  contentType?: string | null;
}

/** @inventedArm if — PERMANENT */
function contentTypeForServing(this: ServableHost): string | null {
  const contentType = this.contentType as string | null | Promise<string | null>;
  if (contentType instanceof Promise) {
    return contentType.then((contentType) =>
      contentTypeForServing.call({ contentType }),
    ) as unknown as string | null;
  }
  return forciblyServeAsBinary.call({ contentType })
    ? ActiveStorage.binaryContentType
    : contentType;
}

/** @inventedArm if — PERMANENT */
function forcedDispositionForServing(this: ServableHost): "attachment" | undefined {
  const contentType = this.contentType as string | null | Promise<string | null>;
  if (contentType instanceof Promise) {
    return contentType.then((contentType) =>
      forcedDispositionForServing.call({ contentType }),
    ) as unknown as "attachment" | undefined;
  }
  if (forciblyServeAsBinary.call({ contentType }) || !isAllowedInline.call({ contentType })) {
    return "attachment";
  }
  return undefined;
}

/** @internal */
function forciblyServeAsBinary(this: ServableHost): boolean {
  const contentType = this.contentType as string | null | Promise<string | null>;
  if (contentType instanceof Promise) {
    return contentType.then((contentType) =>
      forciblyServeAsBinary.call({ contentType }),
    ) as unknown as boolean;
  }
  return ActiveStorage.contentTypesToServeAsBinary.includes(contentType!);
}

/** @internal */
function isAllowedInline(this: ServableHost): boolean {
  const contentType = this.contentType as string | null | Promise<string | null>;
  if (contentType instanceof Promise) {
    return contentType.then((contentType) =>
      isAllowedInline.call({ contentType }),
    ) as unknown as boolean;
  }
  return ActiveStorage.contentTypesAllowedInline.includes(contentType!);
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
