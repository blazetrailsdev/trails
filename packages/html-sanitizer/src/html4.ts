import { extend } from "@blazetrails/ruby-compat";
import { FullSanitizer } from "./full-sanitizer.js";
import { LinkSanitizer } from "./link-sanitizer.js";
import { SafeListSanitizer } from "./safe-list-sanitizer.js";
import { Sanitizer } from "./sanitizer.js";
import { HTML4, type VendorMethods } from "./namespaces.js";

const VendorMethods: VendorMethods = {
  get fullSanitizer() {
    return HTML4.FullSanitizer;
  },

  get linkSanitizer() {
    return HTML4.LinkSanitizer;
  },

  get safeListSanitizer() {
    return HTML4.SafeListSanitizer;
  },

  get whiteListSanitizer() {
    return this.safeListSanitizer;
  },
};

HTML4.Sanitizer = { VendorMethods } as typeof HTML4.Sanitizer;
extend(HTML4.Sanitizer, VendorMethods);
HTML4.FullSanitizer = FullSanitizer;
HTML4.LinkSanitizer = LinkSanitizer;
HTML4.SafeListSanitizer = SafeListSanitizer;

extend(Sanitizer, VendorMethods);

export const HTML = {
  Sanitizer: Sanitizer as typeof Sanitizer & VendorMethods,
  FullSanitizer: HTML4.FullSanitizer,
  LinkSanitizer: HTML4.LinkSanitizer,
  SafeListSanitizer: HTML4.SafeListSanitizer,
  WhiteListSanitizer: HTML4.SafeListSanitizer,
};

export { HTML4 };
