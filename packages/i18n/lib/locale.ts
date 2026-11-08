export { Fallbacks } from "./locale/fallbacks.js";
export type { FallbackMappings } from "./locale/fallbacks.js";
export * as Tag from "./locale/tag.js";
import { Fallbacks } from "./locale/fallbacks.js";
import * as Tag from "./locale/tag.js";

export type Locale = string;

export const Locale = { name: "I18n::Locale", Fallbacks, Tag };
