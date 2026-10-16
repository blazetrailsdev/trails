import { rbModName, rbObjClass } from "../../object.js";

/**
 * `Psych::Visitors::Visitor` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/visitors/visitor.rb:4`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Visitor {
  /** @noRailsEquivalent PERMANENT */
  accept(target: unknown): unknown {
    return this.visit(target);
  }

  private visit(target: unknown): unknown {
    const method = `visit${rbModName(rbObjClass(target))!.replace(/::/g, "")}`;
    return (this as unknown as Record<string, (target: unknown) => unknown>)[method](target);
  }
}
