// One real consumer of the re-exported I18n namespace: activemodel's
// translation module, which calls I18n.translate from a function body.
import { humanAttributeName } from "../../../../packages/activemodel/src/translation.js";
console.log("[am-translation]", typeof humanAttributeName);
