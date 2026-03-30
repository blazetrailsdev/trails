/**
 * Mirrors: ActiveRecord::Validations::LengthValidator
 *
 * Currently delegates to ActiveModel's LengthValidator. Exists for
 * ActiveRecord namespace parity.
 */
import { LengthValidator as BaseLengthValidator } from "@blazetrails/activemodel";

export class LengthValidator extends BaseLengthValidator {}
