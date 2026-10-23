// Minimal reach for the symbol that stops 05-model and above: the activesupport
// module whose namespace re-export the link cannot resolve.
import { I18n } from "@blazetrails/activesupport/i18n";
console.log("[i18n-only]", typeof I18n);
