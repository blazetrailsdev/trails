import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./crass.js";
import * as m1 from "./crass/parser.js";
import * as m2 from "./crass/scanner.js";
import * as m3 from "./crass/token-scanner.js";
import * as m4 from "./crass/tokenizer.js";
import * as m5 from "./loofah.js";
import * as m6 from "./loofah/concerns.js";
import * as m7 from "./loofah/html5/libxml2-workarounds.js";
import * as m8 from "./loofah/html5/safelist.js";
import * as m9 from "./loofah/html5/scrub.js";
import * as m10 from "./loofah/metahelpers.js";
import * as m11 from "./loofah/scrubber.js";
import * as m12 from "./loofah/scrubbers.js";
import * as m13 from "./rails-html-sanitizer.js";
import * as m14 from "./sanitizer.js";
import * as m15 from "./scrubbers.js";

defineConstants([
  [m0, "Crass", "Crass"],
  [m1, "Parser", "Crass::Parser"],
  [m2, "Scanner", "Crass::Scanner"],
  [m4, "Tokenizer", "Crass::Tokenizer"],
  [m3, "TokenScanner", "Crass::TokenScanner"],
  [m5, "Loofah", "Loofah"],
  [m8, "SafeList", "Loofah::HTML5::SafeList"],
  [m9, "Scrub", "Loofah::HTML5::Scrub"],
  [m7, "LibxmlWorkarounds", "Loofah::LibxmlWorkarounds"],
  [m10, "MetaHelpers", "Loofah::MetaHelpers"],
  [m6, "ScrubBehavior", "Loofah::ScrubBehavior"],
  [m11, "Scrubber", "Loofah::Scrubber"],
  [m11, "ScrubberNotFound", "Loofah::ScrubberNotFound"],
  [m12, "Scrubbers", "Loofah::Scrubbers"],
  [m12, "Strip", "Loofah::Scrubbers::Strip"],
  [m13, "ActionView", "RailsHtmlSanitizer::ActionView"],
  [m15, "PermitScrubber", "Trails::HTML::PermitScrubber"],
  [m14, "Sanitizer", "Trails::HTML::Sanitizer"],
  [m15, "TargetScrubber", "Trails::HTML::TargetScrubber"],
  [m15, "TextOnlyScrubber", "Trails::HTML::TextOnlyScrubber"],
  [m14, "HTML4FullSanitizer", "Trails::HTML4::FullSanitizer"],
  [m14, "HTML4LinkSanitizer", "Trails::HTML4::LinkSanitizer"],
  [m14, "HTML4SafeListSanitizer", "Trails::HTML4::SafeListSanitizer"],
  [m14, "HTML5FullSanitizer", "Trails::HTML5::FullSanitizer"],
  [m14, "HTML5LinkSanitizer", "Trails::HTML5::LinkSanitizer"],
  [m14, "HTML5SafeListSanitizer", "Trails::HTML5::SafeListSanitizer"],
]);
