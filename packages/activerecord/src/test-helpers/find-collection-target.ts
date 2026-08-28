import type { Base } from "../base.js";
import { association } from "../associations/instance-methods.js";

/**
 * Runs a has_many load the way `CollectionProxy` does — `load_target`
 * (`association.rb:189-195`) answers `target`, gated by `find_target?`
 * (`association.rb:320-321`) — off the holder the record itself keeps
 * (`Association#initialize` takes the reflection, `association.rb:41-45`).
 *
 * Test-only sugar: every call site would otherwise repeat the same cast.
 * `async` so `check_validity!` — run when the holder is built, as in
 * `Association#initialize` (`association.rb:41-45`) — surfaces as a rejection
 * like every other load failure.
 */
export async function findCollectionTarget(record: Base, name: string): Promise<Base[]> {
  return (await association.call(record, name).loadTarget()) as Base[];
}
