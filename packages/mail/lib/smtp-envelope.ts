import { ArgumentError, rbInspect } from "@blazetrails/ruby-compat";
import { Utilities } from "./utilities.js";

interface EnvelopeMail {
  smtpEnvelopeFrom(): unknown;
  smtpEnvelopeTo(): unknown;
  encoded(): string | Uint8Array;
}

export class SmtpEnvelope {
  static readonly MAX_ADDRESS_BYTESIZE = 2000;

  private _from!: string;
  private _to!: string[];
  private _message!: string | Uint8Array;

  constructor(mail: EnvelopeMail) {
    this.from = mail.smtpEnvelopeFrom() as string;
    this.to = mail.smtpEnvelopeTo() as string | string[];
    this.message = mail.encoded();
  }

  get from(): string {
    return this._from;
  }

  set from(addr: string) {
    if (Utilities.isBlank(addr)) {
      throw new ArgumentError(`SMTP From address may not be blank: ${rbInspect(addr)}`);
    }

    this._from = this.validateAddr("From", addr);
  }

  get to(): string[] {
    return this._to;
  }

  set to(addr: string | string[]) {
    if (Utilities.isBlank(addr)) {
      throw new ArgumentError(`SMTP To address may not be blank: ${rbInspect(addr)}`);
    }

    this._to = (Array.isArray(addr) ? addr : [addr]).map((addr) => this.validateAddr("To", addr));
  }

  get message(): string | Uint8Array {
    return this._message;
  }

  set message(message: string | Uint8Array) {
    if (Utilities.isBlank(message)) {
      throw new ArgumentError("SMTP message may not be blank");
    }

    this._message = message;
  }

  /** @internal */
  private validateAddr(addrName: string, addr: string): string {
    if (new TextEncoder().encode(addr).length > SmtpEnvelope.MAX_ADDRESS_BYTESIZE) {
      throw new ArgumentError(
        `SMTP ${addrName} address may not exceed ${SmtpEnvelope.MAX_ADDRESS_BYTESIZE} bytes: ${rbInspect(addr)}`,
      );
    }

    if (/[\r\n]/.test(addr)) {
      throw new ArgumentError(
        `SMTP ${addrName} address may not contain CR or LF line breaks: ${rbInspect(addr)}`,
      );
    }

    return addr;
  }
}
