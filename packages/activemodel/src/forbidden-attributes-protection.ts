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
 * Mirrors: ActiveModel::ForbiddenAttributesProtection#sanitize_for_mass_assignment
 * (forbidden_attributes_protection.rb:23-29).
 *
 * @internal Rails-private helper.
 */
export function sanitizeForMassAssignment(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
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
}

/**
 * Mirrors: ActiveModel::ForbiddenAttributesProtection
 * (forbidden_attributes_protection.rb:32
 * `alias :sanitize_forbidden_attributes :sanitize_for_mass_assignment`).
 *
 * A `this`-typed mixin method assigned onto the host class so the named hook
 * is reachable on every model that mixes in mass-assignment, while the real
 * unwrap logic stays in `sanitizeForMassAssignment`.
 *
 * @internal Rails-private helper.
 */
export function sanitizeForbiddenAttributes(
  this: ForbiddenAttributesProtectionHost,
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return this.sanitizeForMassAssignment(attributes);
}

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
