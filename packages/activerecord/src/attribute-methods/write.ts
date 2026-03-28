/**
 * Attribute writing methods.
 *
 * The actual writeAttribute implementation lives on Model (from
 * @blazetrails/activemodel), with Base adding encryption and frozen
 * checks. This module exists to match the Rails file structure for
 * ActiveRecord::AttributeMethods::Write.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */

/**
 * The Write module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */
export interface Write {
  writeAttribute(name: string, value: unknown): void;
}
