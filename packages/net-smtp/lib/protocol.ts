import type { SMTP, SMTPAuthenticationError } from "./smtp.js";

export {
  Net,
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

declare module "@blazetrails/ruby-compat/net/protocol" {
  interface NetModule {
    /** @noRailsEquivalent PERMANENT */
    SMTP: typeof SMTP;
    /** @noRailsEquivalent PERMANENT */
    SMTPAuthenticationError: typeof SMTPAuthenticationError;
  }
}
