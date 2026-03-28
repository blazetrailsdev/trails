/**
 * Attribute reading methods.
 *
 * The actual readAttribute implementation lives on Model (from
 * @blazetrails/activemodel). This module exists to match the Rails
 * file structure for ActiveRecord::AttributeMethods::Read.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */

/**
 * The Read module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */
export interface Read {
  readAttribute(name: string): unknown;
}
