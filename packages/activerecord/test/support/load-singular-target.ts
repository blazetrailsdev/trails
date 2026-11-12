import type { Base } from "../../lib/base.js";
import { association } from "../../lib/associations.js";

export async function loadSingularTarget(record: Base, name: string): Promise<Base | null> {
  return association.call(record, name).loadTarget() as Promise<Base | null>;
}
