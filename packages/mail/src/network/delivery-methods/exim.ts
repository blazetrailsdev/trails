import { Sendmail } from "./sendmail.js";
import type { SmtpEnvelope } from "../../smtp-envelope.js";

export class Exim extends Sendmail {
  static override readonly DEFAULTS: Record<string, unknown> = {
    location: "/usr/sbin/exim",
    arguments: ["-i", "-t"],
  };

  override destinationsFor(_envelope: SmtpEnvelope): null {
    return null;
  }
}
