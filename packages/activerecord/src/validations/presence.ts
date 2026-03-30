/**
 * Mirrors: ActiveRecord::Validations::PresenceValidator
 *
 * Currently delegates to ActiveModel's PresenceValidator. Exists for
 * ActiveRecord namespace parity. Association-aware behavior (excluding
 * records marked for destruction) should be added here in the future.
 */
import { PresenceValidator as BasePresenceValidator } from "@blazetrails/activemodel";

export class PresenceValidator extends BasePresenceValidator {}
