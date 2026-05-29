// Re-exporting every model module ensures each class is *defined* — in TS a
// module must be imported to exist (no Zeitwerk autoload). The actual
// registration that powers `className:`/`through:` lookups happens separately
// in `loadModelSchemas()` (src/db.ts), which calls `registerModel` on each.
export { User } from "./user.js";
export { Tweet } from "./tweet.js";
export { Follow } from "./follow.js";
export { Like } from "./like.js";
