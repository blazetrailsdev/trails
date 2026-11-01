import { isPresent, presence } from "@blazetrails/activesupport";
import { InvalidContentError, type EncryptedConfiguration } from "@blazetrails/activesupport";
import { MissingKeyError } from "@blazetrails/activesupport/encrypted-file";
import { InvalidMessage } from "@blazetrails/activesupport/message-encryptor";
import {
  File,
  Pathname,
  include,
  type Included,
  rbSetClassPathString,
} from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { environment } from "../command.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { Editor } from "../command/helpers/editor.js";
import { CredentialsGenerator } from "../generators/rails/credentials/credentials-generator.js";
import { EncryptionKeyFileGenerator } from "../generators/rails/encryption-key-file/encryption-key-file-generator.js";
import { Trails } from "../rails.js";
import { Diffing } from "./credentials/credentials-command/diffing.js";

interface CredentialsOptions {
  environment?: string;
  enroll?: boolean;
  disenroll?: boolean;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface CredentialsCommand
  extends Included<typeof Editor>, Included<typeof EnvironmentArgument>, Included<typeof Diffing> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
  /** @internal */
  _gitattributes?: Pathname;
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class CredentialsCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & CredentialsOptions>;

  /** @internal */
  private _contentPath: string | null | undefined;
  /** @internal */
  private _keyPath: string | undefined;
  /** @internal */
  private _credentials: EncryptedConfiguration | undefined;

  static {
    const klass = this as unknown as ThorClass;
    include(this, Editor);
    include(this, EnvironmentArgument);
    include(this, Diffing);

    klass.desc("edit", "Open the decrypted credentials in `$VISUAL` or `$EDITOR` for editing");
    klass.methodAdded("edit");

    klass.desc("show", "Show the decrypted credentials");
    klass.methodAdded("show");

    klass.desc("diff", "Enroll/disenroll in decrypted diffs of credentials using git");
    klass.option("enroll", {
      type: "boolean",
      default: false,
      desc: "Enroll project in credentials file diffing with `git diff`",
    });
    klass.option("disenroll", {
      type: "boolean",
      default: false,
      desc: "Disenroll project from credentials file diffing",
    });
    klass.methodAdded("diff");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }
  }

  async edit(): Promise<void> {
    await this.loadEnvironmentConfigBang();
    await this.loadGenerators();

    if (this.isEnvironmentSpecified()) {
      if (this.config().contentPath == null)
        this._contentPath = `config/credentials/${this.environment()}.yml.enc`;
      if (this.config().keyPath == null)
        this._keyPath = `config/credentials/${this.environment()}.key`;
    }

    await this.ensureEncryptionKeyHasBeenAdded();
    await this.ensureCredentialsHaveBeenAdded();
    await this.ensureDiffingDriverIsConfigured();

    await this.changeCredentialsInSystemEditor();
  }

  async show(): Promise<void> {
    await this.loadEnvironmentConfigBang();

    const credentials = await this.credentials();
    this.say(presence(await credentials.read()) ?? (await this.missingCredentialsMessage()));
  }

  async diff(contentPath: string | null = null): Promise<void> {
    try {
      this._contentPath = contentPath;
      if (contentPath != null) {
        this.setEnvironment(this.extractEnvironmentFromPath(contentPath));
        await this.loadEnvironmentConfigBang();

        const credentials = await this.credentials();
        this.say(
          presence(await credentials.read()) ?? (await File.readAsync(credentials.contentPath)),
        );
      } else {
        if (this.options.disenroll) await this.disenrollProjectFromCredentialsDiffing();
        if (this.options.enroll) await this.enrollProjectInCredentialsDiffing();
      }
    } catch (e) {
      if (!(e instanceof InvalidMessage)) throw e;
      this.say(await File.readAsync((await this.credentials()).contentPath));
    }
  }

  /** @internal */
  private config(): { contentPath: string | null; keyPath: string | null } {
    return Trails.application!.config.credentials;
  }

  /**
   * @internal
   * @inventedArm credentialsDefaults — CONVERGEABLE credentials-config-is-inheritable-options
   */
  private async contentPath(): Promise<string> {
    return (this._contentPath ??= this.relativePath(
      this.config().contentPath ??
        (await Trails.application!.config.credentialsDefaults()).contentPath,
    ));
  }

  /**
   * @internal
   * @inventedArm credentialsDefaults — CONVERGEABLE credentials-config-is-inheritable-options
   */
  private async keyPath(): Promise<string> {
    return (this._keyPath ??= this.relativePath(
      this.config().keyPath ?? (await Trails.application!.config.credentialsDefaults()).keyPath,
    ));
  }

  /** @internal */
  private async credentials(): Promise<EncryptedConfiguration> {
    return (this._credentials ??= await Trails.application!.encrypted(await this.contentPath(), {
      keyPath: await this.keyPath(),
    }));
  }

  /** @internal */
  private async ensureEncryptionKeyHasBeenAdded(): Promise<void> {
    if (await (await this.credentials()).isKey()) return;

    const encryptionKeyFileGenerator = new EncryptionKeyFileGenerator();
    await encryptionKeyFileGenerator.addKeyFile(await this.keyPath());
    await encryptionKeyFileGenerator.ignoreKeyFile(await this.keyPath());
  }

  /** @internal */
  private async ensureCredentialsHaveBeenAdded(): Promise<void> {
    await new CredentialsGenerator([await this.contentPath(), await this.keyPath()], {
      skipSecretKeyBase:
        this.isEnvironmentSpecified() && ["development", "test"].includes(this.environment()),
      quiet: true,
    }).invokeAll();
  }

  /** @internal */
  private async changeCredentialsInSystemEditor(): Promise<void> {
    try {
      await this.usingSystemEditor(async () => {
        this.say(`Editing ${await this.contentPath()}...`);
        await (
          await this.credentials()
        ).change(async (tmpPath) => {
          await this.systemEditor(tmpPath);
        });
        this.say("File encrypted and saved.");
        await this.warnIfCredentialsAreInvalid();
      });
    } catch (error) {
      if (error instanceof MissingKeyError) {
        this.say(error.message);
      } else if (error instanceof InvalidMessage) {
        this.say(`Couldn't decrypt ${await this.contentPath()}. Perhaps you passed the wrong key?`);
      } else {
        throw error;
      }
    }
  }

  /** @internal */
  private async warnIfCredentialsAreInvalid(): Promise<void> {
    try {
      await (await this.credentials()).validateBang();
    } catch (error) {
      if (!(error instanceof InvalidContentError)) throw error;
      this.say(`WARNING: ${error.message}`, "red");
      this.say("");
      this.say(
        `Your application will not be able to load '${await this.contentPath()}' until the error has been fixed.`,
        "red",
      );
    }
  }

  /** @internal */
  private async missingCredentialsMessage(): Promise<string> {
    if (!(await (await this.credentials()).isKey())) {
      return `Missing '${await this.keyPath()}' to decrypt credentials. See \`${this.executable("help")}\`.`;
    } else {
      return `File '${await this.contentPath()}' does not exist. Use \`${this.executable("edit")}\` to change that.`;
    }
  }

  /** @internal */
  private relativePath(path: string): string {
    const root = Trails.root()!;
    return new Pathname(root).join(path).relativePathFrom(root).toString();
  }

  /** @internal */
  private extractEnvironmentFromPath(path: string): string | null | undefined {
    return (
      this.availableEnvironments().find((env) => path.endsWith(`${env}.yml.enc`)) ||
      this.extractCustomEnvironment(path)
    );
  }

  /** @internal */
  private extractCustomEnvironment(path: string): string | null | undefined {
    return /config\/credentials\/(.+)\.yml\.enc/.exec(path)?.[1];
  }
}

rbSetClassPathString(CredentialsCommand, { name: "Rails::Command" }, "CredentialsCommand");
