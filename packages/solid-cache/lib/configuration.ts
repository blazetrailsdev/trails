import { Encryptor, MessagePackMessageSerializer } from "@blazetrails/activerecord/encryption";
import { isPresent } from "@blazetrails/activesupport";
import { ArgumentError, constSet } from "@blazetrails/ruby-compat";
import { SolidCache } from "./solid-cache.js";

type ConnectsTo = { shards?: Record<string, Record<string, string>> } & Record<string, unknown>;

export class Configuration {
  readonly storeOptions: Record<string, unknown>;
  connectsTo!: ConnectsTo | null;
  readonly executor: unknown;
  readonly sizeEstimateSamples: number;
  readonly encrypt: unknown;
  readonly encryptionContextProperties: Record<string, unknown> | null;

  constructor({
    storeOptions = {},
    database = null,
    databases = null,
    connectsTo = null,
    executor = null,
    encrypt = false,
    encryptionContextProperties = null,
    sizeEstimateSamples = 10_000,
  }: {
    storeOptions?: Record<string, unknown>;
    database?: string | null;
    databases?: string[] | null;
    connectsTo?: ConnectsTo | null;
    executor?: unknown;
    encrypt?: unknown;
    encryptionContextProperties?: Record<string, unknown> | null;
    sizeEstimateSamples?: number;
  } = {}) {
    this.storeOptions = storeOptions;
    this.sizeEstimateSamples = sizeEstimateSamples;
    this.executor = executor;
    this.encrypt = encrypt;
    this.encryptionContextProperties = encryptionContextProperties;
    if (this.isEncrypt()) {
      this.encryptionContextProperties ??= this.defaultEncryptionContextProperties();
    }
    this.setConnectsTo({ database, databases, connectsTo });
  }

  isSharded(): Record<string, Record<string, string>> | null | undefined {
    return this.connectsTo && this.connectsTo.shards;
  }

  shardKeys(): string[] {
    return this.isSharded() ? Object.keys(this.connectsTo!.shards!) : [];
  }

  isEncrypt(): boolean {
    return isPresent(this.encrypt);
  }

  /** @internal */
  private setConnectsTo({
    database,
    databases,
    connectsTo,
  }: {
    database: string | null;
    databases: string[] | null;
    connectsTo: ConnectsTo | null;
  }): void {
    if ([database, databases, connectsTo].filter((x) => x != null).length > 1) {
      throw new ArgumentError("You can only specify one of :database, :databases, or :connects_to");
    }

    if (database) {
      this.connectsTo = { shards: { [database]: { writing: database } } };
    } else if (databases) {
      this.connectsTo = {
        shards: Object.fromEntries(databases.map((database) => [database, { writing: database }])),
      };
    } else if (connectsTo) {
      this.connectsTo = connectsTo;
    } else {
      this.connectsTo = null;
    }
  }

  /** @internal */
  private defaultEncryptionContextProperties(): Record<string, unknown> {
    return {
      encryptor: new Encryptor({ compress: false }),
      messageSerializer: new MessagePackMessageSerializer(),
    };
  }
}

constSet(SolidCache, "Configuration", Configuration);

SolidCache.configuration = new Configuration();
