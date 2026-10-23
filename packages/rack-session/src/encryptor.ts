import { Utils } from "@blazetrails/rack";
import {
  ArgumentError,
  Base64,
  JSON,
  Marshal,
  OpenSSL,
  Range,
  SecureRandom,
  StandardError,
  b,
  rbObjAsString,
  byteslice,
  rbStrPlus,
  pack,
  sliceBang,
  strlen,
  unpack,
  type Cipher,
} from "@blazetrails/ruby-compat";

export interface EncryptorOptions {
  serializeJson?: boolean;
  padSize?: unknown;
  purpose?: string | false | null;
}

export class Encryptor {
  static readonly Error = class Error extends StandardError {};

  static readonly InvalidSignature = class InvalidSignature extends Encryptor.Error {};

  static readonly InvalidMessage = class InvalidMessage extends Encryptor.Error {};

  private options: Required<EncryptorOptions>;
  private hmacSecret: Uint8Array;
  private cipherSecret: Uint8Array;
  private _serializer?: typeof JSON | typeof Marshal;

  constructor(secret: unknown, opts: EncryptorOptions = {}) {
    if (!(typeof secret === "string" || secret instanceof Uint8Array)) {
      throw new ArgumentError("secret must be a String");
    }
    const bytesize = b(secret).length;
    if (!(bytesize >= 64)) {
      throw new ArgumentError(`invalid secret: ${bytesize}, must be >=64`);
    }

    switch (true) {
      case opts.padSize == null:
        break;
      case Number.isInteger(opts.padSize):
        if (!new Range(2, 4096).isInclude(opts.padSize as number)) {
          throw new ArgumentError(`invalid pad_size: ${opts.padSize}`);
        }
        break;
      default:
        throw new ArgumentError(
          `invalid pad_size: ${rbObjAsString(opts.padSize)}; must be Integer or nil`,
        );
    }

    this.options = Object.assign({ serializeJson: false, padSize: 32, purpose: null }, opts);

    this.hmacSecret = b(secret);
    [this.cipherSecret, this.hmacSecret] = sliceBang(this.hmacSecret, 0, 32) as [
      Uint8Array,
      Uint8Array,
    ];
  }

  decrypt(base64Data: string): unknown {
    try {
      let data: Uint8Array = Buffer.from(Base64.urlsafeDecode64(base64Data), "latin1");

      let signature: Uint8Array | null = null;
      [signature, data] = sliceBang(data, new Range(-32, -1));

      this.verifyAuthenticityBang(data, signature);

      let _version: Uint8Array | null = null;
      [_version, data] = sliceBang(data, 0, 1);
      let messageSecret: Uint8Array | null = null;
      [messageSecret, data] = sliceBang(data, 0, 32);
      let cipherIv: Uint8Array | null = null;
      [cipherIv, data] = sliceBang(data, 0, 16);

      const cipher = this.newCipher();
      cipher.decrypt();

      this.setCipherKey(cipher, this.cipherSecretFromMessageSecret(messageSecret!));

      cipher.iv = cipherIv!;
      data = rbStrPlus(cipher.update(data), cipher.final()) as Uint8Array;

      return this.deserializedMessage(data);
    } catch (e) {
      if (e instanceof ArgumentError) throw new Encryptor.InvalidSignature("Message invalid");
      throw e;
    }
  }

  encrypt(message: unknown): string {
    const version = "\x01";

    const serializedPayload = this.serializePayload(message);
    const [messageSecret, cipherSecret] = this.newMessageAndCipherSecret();

    const cipher = this.newCipher();
    cipher.encrypt();

    this.setCipherKey(cipher, cipherSecret);

    const cipherIv = cipher.randomIv();

    const encryptedData = rbStrPlus(cipher.update(serializedPayload), cipher.final());

    let data: string | Uint8Array = new Uint8Array(0);
    data = rbStrPlus(data, version);
    data = rbStrPlus(data as Uint8Array, messageSecret);
    data = rbStrPlus(data as Uint8Array, cipherIv);
    data = rbStrPlus(data as Uint8Array, encryptedData);
    data = rbStrPlus(data as Uint8Array, this.computeSignature(data as Uint8Array));

    return Base64.urlsafeEncode64(data);
  }

  /** @internal */
  private newCipher(): Cipher {
    return new OpenSSL.Cipher("aes-256-ctr");
  }

  /** @internal */
  private newMessageAndCipherSecret(): [Uint8Array, Uint8Array] {
    const messageSecret = SecureRandom.randomBytes(32);

    return [messageSecret, this.cipherSecretFromMessageSecret(messageSecret)];
  }

  /** @internal */
  private cipherSecretFromMessageSecret(messageSecret: Uint8Array): Uint8Array {
    return OpenSSL.HMAC.digest(OpenSSL.Digest.SHA256.new(), this.cipherSecret, messageSecret);
  }

  /** @internal */
  private setCipherKey(cipher: Cipher, key: Uint8Array): void {
    cipher.key = key;
  }

  /** @internal */
  private get serializer(): typeof JSON | typeof Marshal {
    return (this._serializer ??= this.options.serializeJson ? JSON : Marshal);
  }

  /** @internal */
  private computeSignature(data: Uint8Array): Uint8Array {
    let signingData: string | Uint8Array = data;
    if (this.options.purpose != null && this.options.purpose !== false) {
      signingData = rbStrPlus(signingData, this.options.purpose);
    }

    return OpenSSL.HMAC.digest(OpenSSL.Digest.SHA256.new(), this.hmacSecret, signingData);
  }

  /** @internal */
  private verifyAuthenticityBang(data: Uint8Array | null, signature: Uint8Array | null): void {
    if (data == null || signature == null) throw new Encryptor.InvalidMessage("Message is invalid");

    if (!Utils.secureCompare(signature, this.computeSignature(data))) {
      throw new Encryptor.InvalidSignature("HMAC is invalid");
    }
  }

  /** @internal */
  private serializePayload(message: unknown): Uint8Array {
    const dumped = this.serializer.dump(message);
    const serializedData = this.serializer === JSON ? b(dumped as string) : dumped;

    if (this.options.padSize == null)
      return rbStrPlus(pack([0], "v"), serializedData) as Uint8Array;

    const padSize = this.options.padSize as number;
    const size =
      typeof serializedData === "string" ? strlen(serializedData) : serializedData.length;
    const paddingBytes = padSize - ((2 + size) % padSize);
    const paddingData = SecureRandom.randomBytes(paddingBytes);

    return rbStrPlus(
      rbStrPlus(pack([paddingBytes], "v"), paddingData) as Uint8Array,
      serializedData,
    ) as Uint8Array;
  }

  /** @internal */
  private deserializedMessage(data: Uint8Array): unknown {
    const [paddingBytes] = unpack(data, "v") as number[];

    const serializedData = byteslice(data, 2 + paddingBytes, data.length);
    return this.serializer.load(serializedData!);
  }
}
