/**
 * ActionController::EtagWithTemplateDigest
 *
 * When rendering, includes the template digest in the ETag so that
 * template changes bust browser caches.
 * @see https://api.rubyonrails.org/classes/ActionController/EtagWithTemplateDigest.html
 */

import { getCrypto } from "@blazetrails/activesupport";
import {
  combineEtags as _combineEtags,
  httpCacheForever as _httpCacheForever,
  includeContent as _includeContent,
  noStore as _noStore,
  type ConditionalGetHost,
} from "./conditional-get.js";

/**
 * Rails `Head#include_content?` — re-exposed because `EtagWithTemplateDigest` includes
 * `ConditionalGet` which includes `Head`.
 * @internal
 */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

/** Rails `ConditionalGet#http_cache_forever` — re-exposed via include chain. */
export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  return _httpCacheForever.call(this, options, block);
}

/** Rails `ConditionalGet#no_store` — re-exposed via include chain. */
export function noStore(this: ConditionalGetHost): void {
  return _noStore.call(this);
}

/**
 * Rails `ConditionalGet#combine_etags` — re-exposed via include chain.
 * @internal
 */
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
export function pickTemplateForEtag(
  options: { template?: string | false } | undefined,
  controller: { actionName?: string },
): string | undefined {
  if (options?.template === false) return undefined;
  return (options?.template as string | undefined) ?? controller.actionName;
}

/** @internal */
export function lookupAndDigestTemplate(
  template: string,
  lookupContext: TemplateLookupContext,
): string | undefined {
  return lookupContext.digestFor?.(template) ?? undefined;
}

/** @internal */
export function determineTemplateEtag(
  options: { template?: string | false } | undefined,
  controller: { actionName?: string },
  lookupContext: TemplateLookupContext,
): string | undefined {
  const template = pickTemplateForEtag(options, controller);
  if (template === undefined) return undefined;
  return lookupAndDigestTemplate(template, lookupContext);
}

export function templateEtagger(
  controller: { actionName?: string },
  lookupContext?: TemplateLookupContext,
  options?: { template?: string | false },
): string | undefined {
  if (!lookupContext) return undefined;
  return determineTemplateEtag(options, controller, lookupContext);
}
