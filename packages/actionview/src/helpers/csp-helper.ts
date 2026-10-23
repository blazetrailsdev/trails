import { tag, type TagHelperHost, type TagBuilder } from "./tag-helper.js";
import type { SafeBuffer } from "@blazetrails/activesupport";

interface CspHelperHost extends TagHelperHost {
  isContentSecurityPolicy(): boolean;
  contentSecurityPolicyNonce(): string | null;
}

export function cspMetaTag(
  this: CspHelperHost,
  options: Record<string, unknown> = {},
): SafeBuffer | TagBuilder | null {
  options = { ...options };
  if (this.isContentSecurityPolicy()) {
    options.name = "csp-nonce";
    options.content = this.contentSecurityPolicyNonce();
    return tag.call(this, "meta", options);
  }
  return null;
}

export const CspHelper = {
  cspMetaTag,
};
