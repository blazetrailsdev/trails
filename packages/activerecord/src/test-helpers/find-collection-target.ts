import type { Base } from "../base.js";
import { association } from "../associations/instance-methods.js";

export async function findCollectionTarget(record: Base, name: string): Promise<Base[]> {
  return (await association.call(record, name).loadTarget()) as Base[];
}
