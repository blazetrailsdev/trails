import type { Base } from "./base.js";
import { ReadOnlyRecord } from "./errors.js";

/**
 * Timestamp handling for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Timestamp
 */

/**
 * Update the updated_at timestamp (and optionally other timestamp
 * columns) without changing other attributes. Skips validations
 * and callbacks (except after_touch).
 *
 * Mirrors: ActiveRecord::Timestamp#touch
 */
export async function touch(instance: Base, ...names: string[]): Promise<boolean> {
  if (instance.isReadonly()) {
    throw new ReadOnlyRecord(`${instance.constructor.name} is marked as readonly`);
  }
  if (!instance.isPersisted()) return false;
  const now = new Date();
  const attrs: Record<string, unknown> = {};

  const ctor = instance.constructor as typeof Base;
  if (ctor._attributeDefinitions.has("updated_at")) {
    attrs.updated_at = now;
  }

  for (const name of names) {
    attrs[name] = now;
  }

  if (Object.keys(attrs).length === 0) return false;

  await instance.updateColumns(attrs);

  await ctor._callbackChain.runAfter("touch", instance);
  return true;
}

/**
 * Touch all records matching the current scope.
 *
 * Mirrors: ActiveRecord::Base.touch_all
 */
export async function touchAll(modelClass: typeof Base, ...names: string[]): Promise<number> {
  return modelClass.all().touchAll(...names);
}
