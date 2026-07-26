import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";

export class Verifier extends MessageVerifier {
  protected override encode(data: string | Buffer): string {
    return super.encode(data, true);
  }

  protected override decode(encoded: string): Buffer {
    return super.decode(encoded, true);
  }
}
