import { Protocol, TopLevel } from "@blazetrails/ruby-compat";
import type { SMTP, SMTPAuthenticationError } from "./smtp.js";

export {
  Protocol,
  ProtocolError,
  ProtoSyntaxError,
  ProtoFatalError,
  ProtoUnknownError,
  ProtoServerError,
  ProtoAuthError,
  OpenTimeout,
  ReadTimeout,
} from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export const Net: {
  Protocol?: typeof Protocol;
  SMTP?: typeof SMTP;
  SMTPAuthenticationError?: typeof SMTPAuthenticationError;
} = {};
TopLevel.Net = Net;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Net?: typeof Net;
  }
}

Net.Protocol = Protocol;
