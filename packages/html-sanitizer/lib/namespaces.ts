import { TopLevel } from "@blazetrails/ruby-compat";
import type {
  HTML4FullSanitizer,
  HTML4LinkSanitizer,
  HTML4SafeListSanitizer,
  HTML5FullSanitizer,
  HTML5LinkSanitizer,
  HTML5SafeListSanitizer,
  Sanitizer,
} from "./sanitizer.js";

export interface VendorMethods {
  readonly fullSanitizer: typeof HTML4FullSanitizer | typeof HTML5FullSanitizer;
  readonly linkSanitizer: typeof HTML4LinkSanitizer | typeof HTML5LinkSanitizer;
  readonly safeListSanitizer: typeof HTML4SafeListSanitizer | typeof HTML5SafeListSanitizer;
  readonly whiteListSanitizer: typeof HTML4SafeListSanitizer | typeof HTML5SafeListSanitizer;
}

export const HTML = {} as {
  Sanitizer: typeof Sanitizer;
  FullSanitizer: typeof HTML4FullSanitizer;
  LinkSanitizer: typeof HTML4LinkSanitizer;
  SafeListSanitizer: typeof HTML4SafeListSanitizer;
  WhiteListSanitizer: typeof HTML4SafeListSanitizer;
};

export const HTML4 = {} as {
  Sanitizer: VendorMethods & { VendorMethods: VendorMethods };
  FullSanitizer: typeof HTML4FullSanitizer;
  LinkSanitizer: typeof HTML4LinkSanitizer;
  SafeListSanitizer: typeof HTML4SafeListSanitizer;
};

export const HTML5 = {} as {
  Sanitizer: VendorMethods;
  FullSanitizer: typeof HTML5FullSanitizer;
  LinkSanitizer: typeof HTML5LinkSanitizer;
  SafeListSanitizer: typeof HTML5SafeListSanitizer;
};

const Trails = (TopLevel.Trails ??= { name: "Trails" } as NonNullable<
  typeof TopLevel.Trails
>) as NonNullable<typeof TopLevel.Trails> & {
  HTML: typeof HTML;
  HTML4: typeof HTML4;
  HTML5: typeof HTML5;
};

Trails.HTML = HTML;
Trails.HTML4 = HTML4;
Trails.HTML5 = HTML5;
