import { MessageVerifier } from "./message-verifier.js";
import { RotationCoordinator, type BuildOptions } from "./messages/rotation-coordinator.js";

export class MessageVerifiers extends RotationCoordinator<MessageVerifier> {
  /** @internal */
  protected build(salt: string, options: BuildOptions): MessageVerifier {
    const { secretGenerator, secretGeneratorOptions, ...rest } = options;
    return new MessageVerifier(
      secretGenerator(salt, secretGeneratorOptions) as string | Buffer,
      rest,
    );
  }
}
