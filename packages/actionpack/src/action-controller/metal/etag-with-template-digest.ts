import { getCrypto } from "@blazetrails/ruby-compat";
import {
  combineEtags as _combineEtags,
  httpCacheForever as _httpCacheForever,
  includeContent as _includeContent,
  noStore as _noStore,
  type ConditionalGetHost,
} from "./conditional-get.js";

/** @internal */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  return _httpCacheForever.call(this, options, block);
}

export function noStore(this: ConditionalGetHost): void {
  return _noStore.call(this);
}

/** @internal */
export function combineEtags(
  this: unknown,
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return _combineEtags.call(this, validator, options);
}

export function templateDigest(template: string): string {
  return getCrypto().createHash("md5").update(template).digest("hex");
}

export type TemplateLookupContext = { digestFor?(template: string): string | null };

/** @internal */
export interface EtagWithTemplateDigestHost {
  actionName?: string;
  lookupContext?: TemplateLookupContext;
}

/** @internal */
export function pickTemplateForEtag(
  this: EtagWithTemplateDigestHost,
  options: { template?: string | false } | undefined,
): string | undefined {
  if (options?.template === false) return undefined;
  return options?.template ?? this.actionName;
}

/** @internal */
export function lookupAndDigestTemplate(
  this: EtagWithTemplateDigestHost,
  template: string,
): string | undefined {
  return this.lookupContext?.digestFor?.(template) ?? undefined;
}

/** @internal */
export function determineTemplateEtag(
  this: EtagWithTemplateDigestHost,
  options: { template?: string | false } | undefined,
): string | undefined {
  const template = pickTemplateForEtag.call(this, options);
  if (template === undefined) return undefined;
  return lookupAndDigestTemplate.call(this, template);
}

export function templateEtagger(
  controller: { actionName?: string },
  lookupContext?: TemplateLookupContext,
  options?: { template?: string | false },
): string | undefined {
  if (!lookupContext) return undefined;
  return determineTemplateEtag.call({ ...controller, lookupContext }, options);
}
