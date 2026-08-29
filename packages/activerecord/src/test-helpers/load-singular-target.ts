import type { Base } from "../base.js";
import { association } from "../associations/instance-methods.js";

export async function loadSingularTarget(record: Base, name: string): Promise<Base | null> {
  return association.call(record, name).loadTarget() as Promise<Base | null>;
}
