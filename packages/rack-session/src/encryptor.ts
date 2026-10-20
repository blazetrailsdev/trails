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
  forceEncoding,
  rbObjAsString,
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
  private hmacSecret: string;
  private cipherSecret: string;
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
    [this.cipherSecret, this.hmacSecret] = sliceBang(this.hmacSecret, 0, 32) as [string, string];

    Object.freeze(this.hmacSecret);
    Object.freeze(this.cipherSecret);
  }

  decrypt(base64Data: string): unknown {
    try {
      let data = Base64.urlsafeDecode64(base64Data);

      let signature: string | null = null;
      [signature, data] = sliceBang(data, new Range(-32, -1));

      this.verifyAuthenticityBang(data, signature);

      let _version: string | null = null;
      [_version, data] = sliceBang(data, 0, 1);
      let messageSecret: string | null = null;
      [messageSecret, data] = sliceBang(data, 0, 32);
      let cipherIv: string | null = null;
      [cipherIv, data] = sliceBang(data, 0, 16);

      const cipher = this.newCipher();
      cipher.decrypt();

      this.setCipherKey(cipher, this.cipherSecretFromMessageSecret(messageSecret!));

      cipher.iv = Buffer.from(cipherIv!, "latin1");
      data =
        cipher.update(Buffer.from(data, "latin1")).toString("latin1") +
        cipher.final().toString("latin1");

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

    const cipherIv = cipher.randomIv().toString("latin1");

    const encryptedData =
      cipher.update(Buffer.from(serializedPayload, "latin1")).toString("latin1") +
      cipher.final().toString("latin1");

    let data = "";
    data += version;
    data += messageSecret;
    data += cipherIv;
    data += encryptedData;
    data += this.computeSignature(data);

    return Base64.urlsafeEncode64(data);
  }

  /** @internal */
  private newCipher(): Cipher {
    return new OpenSSL.Cipher("aes-256-ctr");
  }

  /** @internal */
  private newMessageAndCipherSecret(): [string, string] {
    const messageSecret = SecureRandom.randomBytes(32).toString("latin1");

    return [messageSecret, this.cipherSecretFromMessageSecret(messageSecret)];
  }

  /** @internal */
  private cipherSecretFromMessageSecret(messageSecret: string): string {
    return OpenSSL.HMAC.digest(
      OpenSSL.Digest.SHA256.new(),
      Buffer.from(this.cipherSecret, "latin1"),
      Buffer.from(messageSecret, "latin1"),
    ).toString("latin1");
  }

  /** @internal */
  private setCipherKey(cipher: Cipher, key: string): void {
    cipher.key = Buffer.from(key, "latin1");
  }

  /** @internal */
  private get serializer(): typeof JSON | typeof Marshal {
    return (this._serializer ??= this.options.serializeJson ? JSON : Marshal);
  }

  /** @internal */
  private computeSignature(data: string): string {
    let signingData = data;
    if (this.options.purpose != null && this.options.purpose !== false) {
      signingData += b(this.options.purpose);
    }

    return OpenSSL.HMAC.digest(
      OpenSSL.Digest.SHA256.new(),
      Buffer.from(this.hmacSecret, "latin1"),
      Buffer.from(signingData, "latin1"),
    ).toString("latin1");
  }

  /** @internal */
  private verifyAuthenticityBang(data: string | null, signature: string | null): void {
    if (data == null || signature == null) throw new Encryptor.InvalidMessage("Message is invalid");

    if (!Utils.secureCompare(signature, this.computeSignature(data))) {
      throw new Encryptor.InvalidSignature("HMAC is invalid");
    }
  }

  /** @internal */
  private serializePayload(message: unknown): string {
    const serializedData = this.serializer.dump(message);

    if (this.options.padSize == null)
      return `${pack([0], "v")}${this.serializer === JSON ? b(serializedData) : serializedData}`;

    const padSize = this.options.padSize as number;
    const paddingBytes = padSize - ((2 + strlen(serializedData)) % padSize);
    const paddingData = SecureRandom.randomBytes(paddingBytes).toString("latin1");

    return `${pack([paddingBytes], "v")}${paddingData}${this.serializer === JSON ? b(serializedData) : serializedData}`;
  }

  /** @internal */
  private deserializedMessage(data: string): unknown {
    const [paddingBytes] = unpack(data, "v") as number[];

    const start = 2 + paddingBytes;
    let serializedData = start > data.length ? null : data.slice(start, start + data.length);
    if (this.serializer === JSON && serializedData != null) {
      serializedData = forceEncoding(serializedData, "UTF-8");
    }
    return this.serializer.load(serializedData as string);
  }
}
