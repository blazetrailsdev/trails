/**
 * Presence validator for a required `belongs_to` association.
 *
 * Mirrors Rails BelongsToBuilder.define_validations, which validates the
 * association NAME (so `read_attribute_for_validation` reads the loaded
 * in-memory target) rather than the foreign key column. In Rails the
 * PresenceValidator reads the association, which transparently loads the
 * record from the FK; with an unsaved target assigned in memory the load is
 * skipped and presence is still satisfied, and autosave persists the new
 * parent before the owner so the FK lands.
 *
 * trails validations are synchronous (see CLAUDE.md), so reading an *unloaded*
 * association during validation cannot trigger a DB load. To stay faithful for
 * the common `create({ parentId: id })` shape — where only the FK is set and
 * the target was never loaded — we treat a populated foreign key as satisfying
 * presence, falling back to the standard presence check (on the in-memory
 * target) otherwise. This accepts both `record.parent = Parent.new` (in-memory
 * target) and a directly-assigned FK, matching Rails' observable behavior.
 */
import { isBlank } from "@blazetrails/activesupport";
import { PresenceValidator } from "./presence.js";

type BelongsToRequiredHost = Parameters<PresenceValidator["validateEach"]>[0] & {
  _readAttribute(name: string): unknown;
};

const BELONGS_TO_OPTION_KEYS = [
  "belongsToForeignKeys",
  "belongsToForeignTypes",
  "belongsToPolymorphic",
];

export class BelongsToRequiredValidator extends PresenceValidator {
  override validateEach(record: BelongsToRequiredHost, attribute: string, value: unknown): void {
    if (this._foreignKeyPresent(record)) return;
    super.validateEach(record, attribute, value);
  }

  // Keep the internal reflection options out of `errors.details` / i18n
  // interpolation — only the standard presence keys should surface.
  override filteredErrorOptions(additionalReserved: string[] = []): Record<string, unknown> {
    return super.filteredErrorOptions([...additionalReserved, ...BELONGS_TO_OPTION_KEYS]);
  }

  private _foreignKeyPresent(record: BelongsToRequiredHost): boolean {
    const foreignKeys = this._asArray(this.options.belongsToForeignKeys);
    if (foreignKeys.length === 0) return false;
    const allFksPresent = foreignKeys.every((key) => !isBlank(record._readAttribute(key)));
    if (!allFksPresent) return false;
    if (!this.options.belongsToPolymorphic) return true;
    const foreignTypes = this._asArray(this.options.belongsToForeignTypes);
    return foreignTypes.every((type) => !isBlank(record._readAttribute(type)));
  }

  private _asArray(value: unknown): string[] {
    if (Array.isArray(value)) return value as string[];
    return value == null ? [] : [value as string];
  }
}
