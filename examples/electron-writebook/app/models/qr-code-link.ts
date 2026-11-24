import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Trails } from "@blazetrails/trailties";

export class QrCodeLink {
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  signed(): string {
    return QrCodeLink.verifier().generate(this.url, { purpose: "qr_code" });
  }

  static fromSigned(signed: string): QrCodeLink {
    return new this(QrCodeLink.verifier().verify(signed, { purpose: "qr_code" }) as string);
  }

  private static verifier(): MessageVerifier {
    return new MessageVerifier(QrCodeLink.secret(), { url_safe: true });
  }

  private static secret() {
    return Trails.application.keyGenerator().generateKey("qr_codes");
  }
}
