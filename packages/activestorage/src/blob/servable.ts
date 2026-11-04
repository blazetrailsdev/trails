import { ActiveStorage } from "../active-storage.js";

interface ServableHost {
  contentType: string | null | Promise<string | null>;
  forciblyServeAsBinary(): Promise<boolean>;
  isAllowedInline(): Promise<boolean>;
}

async function contentTypeForServing(this: ServableHost): Promise<string | null> {
  return (await this.forciblyServeAsBinary())
    ? ActiveStorage.binaryContentType
    : await this.contentType;
}

async function forcedDispositionForServing(this: ServableHost): Promise<"attachment" | undefined> {
  if ((await this.forciblyServeAsBinary()) || !(await this.isAllowedInline())) {
    return "attachment";
  }
}

/** @internal */
async function forciblyServeAsBinary(this: ServableHost): Promise<boolean> {
  return ActiveStorage.contentTypesToServeAsBinary.includes((await this.contentType)!);
}

/** @internal */
async function isAllowedInline(this: ServableHost): Promise<boolean> {
  return ActiveStorage.contentTypesAllowedInline.includes((await this.contentType)!);
}

export const Servable = {
  contentTypeForServing,
  forcedDispositionForServing,
  forciblyServeAsBinary,
  isAllowedInline,
};
