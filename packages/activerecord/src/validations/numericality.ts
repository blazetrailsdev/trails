/**
 * Mirrors: ActiveRecord::Validations::NumericalityValidator
 *
 * Currently delegates to ActiveModel's NumericalityValidator. Exists for
 * ActiveRecord namespace parity.
 */
import { NumericalityValidator as BaseNumericalityValidator } from "@blazetrails/activemodel";

export class NumericalityValidator extends BaseNumericalityValidator {}
