import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./crass/parser.js";
import * as m1 from "./crass/scanner.js";
import * as m2 from "./crass/token-scanner.js";
import * as m3 from "./crass/tokenizer.js";
import * as m4 from "./loofah/concerns.js";
import * as m5 from "./loofah/html5/libxml2-workarounds.js";
import * as m6 from "./loofah/html5/safelist.js";
import * as m7 from "./loofah/html5/scrub.js";
import * as m8 from "./loofah/metahelpers.js";
import * as m9 from "./loofah/scrubber.js";
import * as m10 from "./loofah/scrubbers.js";
import * as m11 from "./sanitizer.js";
import * as m12 from "./scrubbers.js";

defineConstants([
  [() => m0, "Parser", "Crass::Parser"],
  [() => m1, "Scanner", "Crass::Scanner"],
  [() => m3, "Tokenizer", "Crass::Tokenizer"],
  [() => m2, "TokenScanner", "Crass::TokenScanner"],
  [() => m6, "SafeList", "Loofah::HTML5::SafeList"],
  [() => m7, "Scrub", "Loofah::HTML5::Scrub"],
  [() => m5, "LibxmlWorkarounds", "Loofah::LibxmlWorkarounds"],
  [() => m8, "MetaHelpers", "Loofah::MetaHelpers"],
  [() => m4, "ScrubBehavior", "Loofah::ScrubBehavior"],
  [() => m9, "Scrubber", "Loofah::Scrubber"],
  [() => m9, "ScrubberNotFound", "Loofah::ScrubberNotFound"],
  [() => m10, "Scrubbers", "Loofah::Scrubbers"],
  [() => m10, "Strip", "Loofah::Scrubbers::Strip"],
  [() => m12, "PermitScrubber", "Trails::HTML::PermitScrubber"],
  [() => m11, "Sanitizer", "Trails::HTML::Sanitizer"],
  [() => m12, "TargetScrubber", "Trails::HTML::TargetScrubber"],
  [() => m12, "TextOnlyScrubber", "Trails::HTML::TextOnlyScrubber"],
  [() => m11, "HTML4FullSanitizer", "Trails::HTML4::FullSanitizer"],
  [() => m11, "HTML4LinkSanitizer", "Trails::HTML4::LinkSanitizer"],
  [() => m11, "HTML4SafeListSanitizer", "Trails::HTML4::SafeListSanitizer"],
  [() => m11, "HTML5FullSanitizer", "Trails::HTML5::FullSanitizer"],
  [() => m11, "HTML5LinkSanitizer", "Trails::HTML5::LinkSanitizer"],
  [() => m11, "HTML5SafeListSanitizer", "Trails::HTML5::SafeListSanitizer"],
]);
