import "../constants.secret.generated.js";
import { SecureRandom, STDOUT } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";

export class SecretCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc(
      "secret",
      "Generate a cryptographically secure secret key (this is typically used to generate a secret for cookie sessions).",
    );
    klass.methodAdded("perform");
  }

  perform(): void {
    STDOUT.puts(SecureRandom.hex(64));
  }
}
