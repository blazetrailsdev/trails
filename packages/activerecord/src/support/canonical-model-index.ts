import "./canonical-model-index-encryption-setup.js";
import "../test-helpers/models/index.js";
import { safeConstantize } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { flushPendingCounterCacheColumns } from "../counter-cache.js";
import { pendingCounterCacheColumns } from "../counter-cache-state.js";

/** @noRailsEquivalent CONVERGEABLE model-registry-and-register-model-are-deleted */
export function flushCanonicalCounterCacheColumns(): void {
  for (const className of pendingCounterCacheColumns.keys()) {
    const klass = safeConstantize(className) as typeof Base | null | undefined;
    if (klass != null) flushPendingCounterCacheColumns(klass, className);
  }
}

flushCanonicalCounterCacheColumns();
