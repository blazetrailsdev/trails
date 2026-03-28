/**
 * The Attributes module — the `attribute` class method API for defining
 * typed attributes on models.
 *
 * In Rails this is a class method mixed in via ActiveSupport::Concern.
 * In our codebase, Base.attribute() is a static method on Base.
 *
 * Mirrors: ActiveRecord::Attributes
 */

/**
 * Static interface for the Attributes module.
 *
 * Mirrors: ActiveRecord::Attributes (class-level methods)
 */
export interface Attributes {
  attribute(name: string, type: string, options?: { default?: unknown }): void;
}
