/**
 * ActionController::EtagWithTemplateDigest
 *
 * When rendering, includes the template digest in the ETag so that
 * template changes bust browser caches.
 * @see https://api.rubyonrails.org/classes/ActionController/EtagWithTemplateDigest.html
 */

import { getCrypto } from "@blazetrails/activesupport";

export function templateDigest(template: string): string {
  return getCrypto().createHash("md5").update(template).digest("hex");
}

export function templateEtagger(
  controller: { actionName?: string },
  lookupContext?: { digestFor?(template: string): string | null },
  options?: { template?: string | false },
): string | undefined {
  if (options?.template === false) return undefined;

  const templateName = options?.template ?? controller.actionName;
  if (!templateName) return undefined;

  if (lookupContext?.digestFor) {
    return lookupContext.digestFor(templateName) ?? undefined;
  }

  return undefined;
}
