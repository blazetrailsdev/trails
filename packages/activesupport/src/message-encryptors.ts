import { MessageEncryptor } from "./message-encryptor.js";
import { RotationCoordinator, type BuildOptions } from "./messages/rotation-coordinator.js";

export class MessageEncryptors extends RotationCoordinator<MessageEncryptor> {
  /** @internal */
  protected build(salt: string, options: BuildOptions): MessageEncryptor {
    const { secretGenerator, secretGeneratorOptions, ...rest } = options;
    const secretLength = MessageEncryptor.keyLen(rest.cipher as string | undefined);
    const secret = secretGenerator(salt, { secretLength, ...secretGeneratorOptions });
    const secrets = (Array.isArray(secret) ? secret : [secret]) as (string | Buffer)[];
    return new MessageEncryptor(secrets[0], secrets[1], rest);
  }
}
