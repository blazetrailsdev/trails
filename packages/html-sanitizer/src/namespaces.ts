import type { FullSanitizer } from "./full-sanitizer.js";
import type { LinkSanitizer } from "./link-sanitizer.js";
import type { SafeListSanitizer } from "./safe-list-sanitizer.js";

export interface VendorMethods {
  readonly fullSanitizer: typeof FullSanitizer;
  readonly linkSanitizer: typeof LinkSanitizer;
  readonly safeListSanitizer: typeof SafeListSanitizer;
  readonly whiteListSanitizer: typeof SafeListSanitizer;
}

export const HTML4 = {} as {
  Sanitizer: VendorMethods & { VendorMethods: VendorMethods };
  FullSanitizer: typeof FullSanitizer;
  LinkSanitizer: typeof LinkSanitizer;
  SafeListSanitizer: typeof SafeListSanitizer;
};

export const HTML5 = {} as {
  Sanitizer: VendorMethods;
  FullSanitizer: typeof FullSanitizer;
  LinkSanitizer: typeof LinkSanitizer;
  SafeListSanitizer: typeof SafeListSanitizer;
};
