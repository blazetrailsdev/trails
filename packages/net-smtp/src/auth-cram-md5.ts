import { Digest, unpack1 } from "@blazetrails/ruby-compat";
import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthCramMD5 extends Authenticator {
  static {
    this.authType("cram_md5");
  }

  /** @internal */
  private _digestClass: typeof Digest | undefined;

  async auth(user: string, secret: string): Promise<Response> {
    const challenge = await this.continue("AUTH CRAM-MD5");
    const crammed = this.cramMd5Response(secret, unpack1(challenge, "m") as unknown as Uint8Array);
    return await this.finish(this.base64Encode(`${user} ${crammed}`));
  }

  static readonly IMASK = 0x36;
  static readonly OMASK = 0x5c;

  cramMd5Response(secret: string, challenge: Uint8Array): string {
    const tmp = this.digestClass.MD5.digest(
      new Uint8Array([...this.cramSecret(secret, AuthCramMD5.IMASK), ...challenge]),
    );
    return this.digestClass.MD5.hexdigest(
      new Uint8Array([...this.cramSecret(secret, AuthCramMD5.OMASK), ...tmp]),
    );
  }

  static readonly CRAM_BUFSIZE = 64;

  cramSecret(secret: string, mask: number): Uint8Array {
    let bytes: Uint8Array = new TextEncoder().encode(secret);
    if (bytes.length > AuthCramMD5.CRAM_BUFSIZE) bytes = this.digestClass.MD5.digest(bytes);
    const buf = new Uint8Array(AuthCramMD5.CRAM_BUFSIZE);
    buf.set(bytes);
    for (let i = 0; i < buf.length; i++) buf[i] ^= mask;
    return buf;
  }

  get digestClass(): typeof Digest {
    return (this._digestClass ??= Digest);
  }
}
