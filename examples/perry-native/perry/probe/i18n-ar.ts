import { Simple } from "../../../../packages/i18n/src/backend/simple.js";
import { Base } from "@blazetrails/activerecord";
const backend = new Simple();
console.log("simple ok:", typeof backend.storeTranslations, "ar ok:", typeof Base);
