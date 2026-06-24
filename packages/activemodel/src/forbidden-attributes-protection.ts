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

/** Host shape for the {@link sanitizeForbiddenAttributes} mixin method. */
export interface ForbiddenAttributesProtectionHost {
  /** @internal Rails-private helper. */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
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
