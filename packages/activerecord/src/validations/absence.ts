/**
 * Mirrors: ActiveRecord::Validations::AbsenceValidator
 *
 * Currently delegates to ActiveModel's AbsenceValidator. Exists for
 * ActiveRecord namespace parity. Association-aware behavior (excluding
 * records marked for destruction) should be added here in the future.
 */
import { AbsenceValidator as BaseAbsenceValidator } from "@blazetrails/activemodel";

export class AbsenceValidator extends BaseAbsenceValidator {}
