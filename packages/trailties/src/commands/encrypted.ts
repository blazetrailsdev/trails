import "../class-paths.encrypted.generated.js";
import { presence } from "@blazetrails/activesupport";
import { InvalidContentError, type EncryptedConfiguration } from "@blazetrails/activesupport";
import { MissingKeyError } from "@blazetrails/activesupport/encrypted-file";
import { InvalidMessage } from "@blazetrails/activesupport/message-encryptor";
import { include, type Included } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { Base } from "../command/base.js";
import { Editor } from "../command/helpers/editor.js";
import { EncryptedFileGenerator } from "../generators/rails/encrypted-file/encrypted-file-generator.js";
import { EncryptionKeyFileGenerator } from "../generators/rails/encryption-key-file/encryption-key-file-generator.js";
import { Trails } from "../rails.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
export interface EncryptedCommand extends Included<typeof Editor> {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class EncryptedCommand extends Base {
  declare options: ThorOptions<Record<string, unknown>>;

  /** @internal */
  private _contentPath: string | undefined;
  /** @internal */
  private _encryptedConfiguration: EncryptedConfiguration | undefined;

  static {
    const klass = this as unknown as ThorClass;
    include(this, Editor);

    klass.classOption("key", {
      aliases: "-k",
      type: "string",
      default: "config/master.key",
      desc: "The Rails.root relative path to the encryption key",
    });

    klass.desc("edit", "Open the decrypted file in `$VISUAL` or `$EDITOR` for editing");
    klass.methodAdded("edit");

    klass.desc("show", "Show the decrypted contents of the file");
    klass.methodAdded("show");
  }

  async edit(..._args: unknown[]): Promise<void> {
    await this.loadEnvironmentConfigBang();

    await this.ensureEncryptionKeyHasBeenAdded();
    await this.ensureEncryptedConfigurationHasBeenAdded();

    await this.changeEncryptedConfigurationInSystemEditor();
  }

  async show(..._args: unknown[]): Promise<void> {
    await this.loadEnvironmentConfigBang();

    const encryptedConfiguration = await this.encryptedConfiguration();
    this.say(
      presence(await encryptedConfiguration.read()) ??
        (await this.missingEncryptedConfigurationMessage()),
    );
  }

  /** @internal */
  private contentPath(): string {
    return (this._contentPath ??= this.args[0] as string);
  }

  /** @internal */
  private keyPath(): string {
    return (this.options as unknown as { get(key: string): string }).get("key");
  }

  /** @internal */
  private async encryptedConfiguration(): Promise<EncryptedConfiguration> {
    return (this._encryptedConfiguration ??= await Trails.application!.encrypted(
      this.contentPath(),
      { keyPath: this.keyPath() },
    ));
  }

  /** @internal */
  private async ensureEncryptionKeyHasBeenAdded(): Promise<void> {
    if (await (await this.encryptedConfiguration()).isKey()) return;
    await this.encryptionKeyFileGenerator().addKeyFile(this.keyPath());
    await this.encryptionKeyFileGenerator().ignoreKeyFile(this.keyPath());
  }

  /** @internal */
  private async ensureEncryptedConfigurationHasBeenAdded(): Promise<void> {
    await this.encryptedFileGenerator().addEncryptedFileSilently(
      this.contentPath(),
      this.keyPath(),
    );
  }

  /** @internal */
  private async changeEncryptedConfigurationInSystemEditor(): Promise<void> {
    try {
      await this.usingSystemEditor(async () => {
        await (
          await this.encryptedConfiguration()
        ).change(async (tmpPath) => {
          await this.systemEditor(tmpPath);
        });
        this.say("File encrypted and saved.");
        await this.warnIfEncryptedConfigurationIsInvalid();
      });
    } catch (error) {
      if (error instanceof MissingKeyError) {
        this.say(error.message);
      } else if (error instanceof InvalidMessage) {
        this.say(`Couldn't decrypt ${this.contentPath()}. Perhaps you passed the wrong key?`);
      } else {
        throw error;
      }
    }
  }

  /** @internal */
  private async warnIfEncryptedConfigurationIsInvalid(): Promise<void> {
    try {
      await (await this.encryptedConfiguration()).validateBang();
    } catch (error) {
      if (!(error instanceof InvalidContentError)) throw error;
      this.say(`WARNING: ${error.message}`, "red");
      this.say("");
      this.say(
        `Your application will not be able to load '${this.contentPath()}' until the error has been fixed.`,
        "red",
      );
    }
  }

  /** @internal */
  private encryptionKeyFileGenerator(): EncryptionKeyFileGenerator {
    return new EncryptionKeyFileGenerator();
  }

  /** @internal */
  private encryptedFileGenerator(): EncryptedFileGenerator {
    return new EncryptedFileGenerator();
  }

  /** @internal */
  private async missingEncryptedConfigurationMessage(): Promise<string> {
    if (!(await (await this.encryptedConfiguration()).isKey())) {
      return `Missing '${this.keyPath()}' to decrypt data. See \`${this.executable("help")}\``;
    } else {
      return `File '${this.contentPath()}' does not exist. Use \`${this.executable("edit")} ${this.contentPath()}\` to change that.`;
    }
  }
}
