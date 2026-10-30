import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./auth-cram-md5.js";
import * as m1 from "./auth-login.js";
import * as m2 from "./auth-plain.js";
import * as m3 from "./auth-xoauth2.js";
import * as m4 from "./authenticator.js";
import * as m5 from "./smtp.js";

registerClassPaths([
  [() => m5.SMTP, "Net::SMTP"],
  [() => m5.Address, "Net::SMTP::Address"],
  [() => m0.AuthCramMD5, "Net::SMTP::AuthCramMD5"],
  [() => m4.Authenticator, "Net::SMTP::Authenticator"],
  [() => m1.AuthLogin, "Net::SMTP::AuthLogin"],
  [() => m2.AuthPlain, "Net::SMTP::AuthPlain"],
  [() => m3.AuthXoauth2, "Net::SMTP::AuthXoauth2"],
  [() => m5.Response, "Net::SMTP::Response"],
  [() => m5.SMTPAuthenticationError, "Net::SMTPAuthenticationError"],
  [() => m5.SMTPError, "Net::SMTPError"],
  [() => m5.SMTPFatalError, "Net::SMTPFatalError"],
  [() => m5.SMTPServerBusy, "Net::SMTPServerBusy"],
  [() => m5.SMTPSyntaxError, "Net::SMTPSyntaxError"],
  [() => m5.SMTPUnknownError, "Net::SMTPUnknownError"],
  [() => m5.SMTPUnsupportedCommand, "Net::SMTPUnsupportedCommand"],
]);
