import type { Base } from "../base.js";
import { association } from "../associations/instance-methods.js";

/**
 * Reads a belongs_to / has_one target the way Rails' own tests do —
 * `record.association(name).load_target` (`association.rb:190`), which holds
 * the cache read and the staleness guard, with
 * `SingularAssociation#find_target` (`singular_association.rb:47-55`) the pure
 * query underneath.
 *
 * `async` so `check_validity!` — run when the holder is built, as in
 * `Association#initialize` (`association.rb:41-45`) — surfaces as a rejection
 * like every other load failure.
 *
 * Test-only sugar for the `load_target` call Rails' tests spell inline: the
 * TypeScript reader answers `Base | Base[] | null`, and every singular call
 * site would otherwise repeat the same narrowing cast.
 */
export async function loadSingularTarget(record: Base, name: string): Promise<Base | null> {
  return association.call(record, name).loadTarget() as Promise<Base | null>;
}
