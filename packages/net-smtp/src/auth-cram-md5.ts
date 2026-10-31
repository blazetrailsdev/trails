import { Digest } from "@blazetrails/ruby-compat";
import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

const encoder = new TextEncoder();

export class AuthCramMD5 extends Authenticator {
  static {
    this.authType("cram_md5");
  }

  static readonly IMASK = 0x36;
  static readonly OMASK = 0x5c;
  static readonly CRAM_BUFSIZE = 64;

  async auth(user: string, secret: string): Promise<Response> {
    const challenge = await this.continue("AUTH CRAM-MD5");
    const crammed = this.cramMd5Response(
      secret,
      Uint8Array.from(atob(challenge), (c) => c.charCodeAt(0)),
    );
    return await this.finish(this.base64Encode(`${user} ${crammed}`));
  }

  cramMd5Response(secret: string, challenge: Uint8Array): string {
    const tmp = this.digestClass.MD5.digest(
      new Uint8Array([...this.cramSecret(secret, AuthCramMD5.IMASK), ...challenge]),
    );
    return this.digestClass.MD5.hexdigest(
      new Uint8Array([...this.cramSecret(secret, AuthCramMD5.OMASK), ...tmp]),
    );
  }

  cramSecret(secret: string, mask: number): Uint8Array {
    let bytes: Uint8Array = encoder.encode(secret);
    if (bytes.length > AuthCramMD5.CRAM_BUFSIZE) bytes = this.digestClass.MD5.digest(bytes);
    const buf = new Uint8Array(AuthCramMD5.CRAM_BUFSIZE);
    buf.set(bytes);
    for (let i = 0; i < buf.length; i++) buf[i] ^= mask;
    return buf;
  }

  get digestClass(): typeof Digest {
    return Digest;
  }
}
