/**
 * Raised when mass-assigning attributes that haven't been permitted.
 *
 * Mirrors: ActiveModel::ForbiddenAttributesError
 */
export class ForbiddenAttributesError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "ForbiddenAttributesError";
  }
}

interface PermittedAttributes {
  permitted?: boolean | (() => boolean);
  toH?(): Record<string, unknown>;
}

/**
 * Mirrors: ActiveModel::ForbiddenAttributesProtection
 * (forbidden_attributes_protection.rb:21-32) — the whole module, whose two
 * members Ruby declares `private` (`private` does not take a method off the
 * module, so both ride along on `include`).
 */
export const ForbiddenAttributesProtection = {
  /**
   * Mirrors: ActiveModel::ForbiddenAttributesProtection#sanitize_for_mass_assignment
   * (forbidden_attributes_protection.rb:23-29).
   *
   * @internal Rails-private helper.
   */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown> {
    const attrs = attributes as Record<string, unknown> & PermittedAttributes;
    // Rails: `if attributes.respond_to?(:permitted?)`
    // (forbidden_attributes_protection.rb:24). params-style objects expose `permitted?` — raise unless permitted, then
    // unwrap via `to_h` so the caller iterates a plain hash, not the wrapper.
    // Rails calls `attributes.to_h` unconditionally; a permitted params object is
    // expected to respond to it (a malformed one would NoMethodError there too).
    // The wrapper-hood conjunct is what stands in for `respond_to?`: it keeps a
    // plain hash carrying a literal `permitted` key out of the guard, since
    // Ruby's Hash does not `respond_to?(:permitted?)` either.
    if (respondToPermitted(attrs)) {
      if (!readPermitted(attrs)) {
        throw new ForbiddenAttributesError();
      }
      return attrs.toH!();
    }
    return attributes;
  },

  /**
   * Mirrors: ActiveModel::ForbiddenAttributesProtection
   * (forbidden_attributes_protection.rb:32
   * `alias :sanitize_forbidden_attributes :sanitize_for_mass_assignment`).
   *
   * Ruby's `alias` shares the one body; TS spells the second name as a member
   * that dispatches through `this`, so a host overriding
   * `sanitizeForMassAssignment` is still reached.
   *
   * @internal Rails-private helper.
   */
  sanitizeForbiddenAttributes(
    this: ForbiddenAttributesProtectionHost,
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.sanitizeForMassAssignment(attributes);
  },
};

/**
 * Mirrors: ActiveModel::ForbiddenAttributesProtection#sanitize_for_mass_assignment
 * (forbidden_attributes_protection.rb:23-29) — the module member above, named
 * at the top level so the callers Rails reaches through `include` can import it.
 *
 * @internal Rails-private helper.
 */
export const sanitizeForMassAssignment = ForbiddenAttributesProtection.sanitizeForMassAssignment;

/**
 * Mirrors: ActiveModel::ForbiddenAttributesProtection
 * (forbidden_attributes_protection.rb:32) — see above.
 *
 * @internal Rails-private helper.
 */
export const sanitizeForbiddenAttributes =
  ForbiddenAttributesProtection.sanitizeForbiddenAttributes;

/**
 * Reads a params-like wrapper's `permitted?`. The real
 * `ActionController::Parameters` exposes it as a boolean GETTER
 * (strong-parameters.ts:113), while duck-typed wrappers may expose a method —
 * Ruby draws no such distinction, so both must answer here.
 */
function readPermitted(attrs: PermittedAttributes): boolean {
  const permitted = attrs.permitted;
  return typeof permitted === "function" ? permitted.call(attrs) : Boolean(permitted);
}

/** Host shape for the {@link sanitizeForbiddenAttributes} mixin method. */
export interface ForbiddenAttributesProtectionHost {
  /** @internal Rails-private helper. */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
}

/**
 * The JS spelling of `attributes.respond_to?(:permitted?)`
 * (forbidden_attributes_protection.rb:24). A plain hash does not respond to it
 * in Ruby either, so the non-plain-prototype gate is what keeps a hash carrying
 * a literal `permitted` key out of the guard. For the real
 * `ActionController::Parameters` analogue, `permitted` is a boolean GETTER
 * (strong-parameters.ts:113), not a method — hence key presence, not
 * callability.
 */
function respondToPermitted(attrs: object): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  return "permitted" in attrs;
}
