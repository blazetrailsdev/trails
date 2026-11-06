import { rbObjClass } from "@blazetrails/ruby-compat";
import { YAML as RubyYAML } from "@blazetrails/ruby-compat/yaml";
import { Body } from "./body.js";
import { Mail } from "./mail.js";
import { Exim } from "./network/delivery-methods/exim.js";
import { FileDelivery } from "./network/delivery-methods/file-delivery.js";
import { LoggerDelivery } from "./network/delivery-methods/logger-delivery.js";
import { Sendmail } from "./network/delivery-methods/sendmail.js";
import { SMTPConnection } from "./network/delivery-methods/smtp-connection.js";
import { SMTP } from "./network/delivery-methods/smtp.js";
import { TestMailer } from "./network/delivery-methods/test-mailer.js";

export const YAML = {
  /** @missingRailsCall new — PERMANENT */
  load(yaml: string): unknown {
    const permittedClasses = [
      "Symbol",

      Body,

      SMTP,
      Sendmail,
      Exim,
      FileDelivery,
      SMTPConnection,
      TestMailer,
      LoggerDelivery,

      rbObjClass(Mail.deliveryMethod() as object),
    ];

    return RubyYAML.safeLoad(yaml, { permittedClasses });
  },
};

Mail.YAML = YAML;
