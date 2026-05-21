import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { getCrypto } from "@blazetrails/activesupport";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";

export interface CredentialsGeneratorOptions extends GeneratorOptions {
  contentPath?: string;
  keyPath?: string;
  skipSecretKeyBase?: boolean;
}

export class CredentialsGenerator extends GeneratorBase {
  readonly contentPath: string;
  readonly keyPath: string;
  readonly skipSecretKeyBase: boolean;
  private memoSecretKeyBase: string | null = null;

  constructor(options: CredentialsGeneratorOptions) {
    super(options);
    this.contentPath = options.contentPath ?? "config/credentials.yml.enc";
    this.keyPath = options.keyPath ?? "config/master.key";
    this.skipSecretKeyBase = options.skipSecretKeyBase ?? false;
  }

  async addCredentialsFile(): Promise<void> {
    if (this.fileExists(this.contentPath)) return;
    this.output(`Adding ${this.contentPath} to store encrypted credentials.`);
    const content = this.renderTemplate();
    await this.encryptedFile().write(content);
    this.output("The following content has been encrypted with the Rails master key:");
    this.output(content);
    this.output("You can edit encrypted credentials with `trails credentials edit`.");
  }

  private encryptedFile(): EncryptedFile {
    const contentPath = this.path.join(this.cwd, this.contentPath);
    this.fs.mkdirSync(this.path.dirname(contentPath), { recursive: true });
    return new EncryptedFile({
      contentPath,
      keyPath: this.path.join(this.cwd, this.keyPath),
      envKey: "RAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  }

  private secretKeyBase(): string {
    return (this.memoSecretKeyBase ??= Buffer.from(getCrypto().randomBytes(64)).toString("hex"));
  }

  private renderTemplate(): string {
    const lines = [
      "# smtp:",
      "#   user_name: my-smtp-user",
      "#   password: my-smtp-password",
      "#",
      "# aws:",
      "#   access_key_id: 123",
      "#   secret_access_key: 345",
    ];
    if (!this.skipSecretKeyBase) {
      lines.push(
        "",
        "# Used as the base secret for all MessageVerifiers in Rails, including the one protecting cookies.",
        `secret_key_base: ${this.secretKeyBase()}`,
      );
    }
    return lines.join("\n") + "\n";
  }
}
