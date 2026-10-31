import { StandardError, Timeout } from "@blazetrails/ruby-compat";
import type { SMTPAuthenticationError } from "./smtp.js";

/** @noRailsEquivalent PERMANENT */
export const Net: { SMTPAuthenticationError?: typeof SMTPAuthenticationError } = {};

/** @noRailsEquivalent PERMANENT */
export class ProtocolError extends StandardError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoSyntaxError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoFatalError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoUnknownError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoServerError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoAuthError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class OpenTimeout extends Timeout.Error {}
