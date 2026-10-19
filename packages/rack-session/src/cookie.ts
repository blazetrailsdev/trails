import type { RackApp } from "@blazetrails/rack";
import { RACK_ERRORS, Utils } from "@blazetrails/rack";
import * as RubyCompat from "@blazetrails/ruby-compat";
import {
  DelegateClass,
  OpenSSL,
  Zlib,
  fetch,
  hashAref,
  hashAset,
  rbFArray,
  rbFCaller,
  rbStrRpartition,
  registerConstant,
  strlen,
  warn,
} from "@blazetrails/ruby-compat";

import {
  isTruthy,
  PersistedSecure,
  type PersistedRequest,
  SessionId as SessionSessionId,
} from "./abstract/id.js";
import { Encryptor, type EncryptorOptions } from "./encryptor.js";

export const RACK_SESSION_UNPACKED_COOKIE_DATA = "rack.session.unpacked_cookie_data";

interface Coder {
  encode(str: unknown): unknown;
  decode(str: unknown): unknown;
}

interface RackErrors {
  puts(string?: string): unknown;
}

export class Cookie extends PersistedSecure {
  static Base64 = class Base64 {
    encode(str: string): string {
      return RubyCompat.Base64.strictEncode64(str);
    }

    decode(str: string): unknown {
      return RubyCompat.Base64.decode64(str);
    }

    static Marshal = class Marshal extends Base64 {
      override encode(str: unknown): string {
        return super.encode(RubyCompat.Marshal.dump(str));
      }

      override decode(str: string | null): unknown {
        if (!isTruthy(str)) return null;
        try {
          return RubyCompat.Marshal.load(super.decode(str!) as string);
        } catch {
          return null;
        }
      }
    };

    static JSON = class JSON extends Base64 {
      override encode(obj: unknown): string {
        return super.encode(RubyCompat.JSON.dump(obj));
      }

      override decode(str: string | null): unknown {
        if (!isTruthy(str)) return null;
        try {
          return RubyCompat.JSON.parse(super.decode(str!) as string);
        } catch {
          return null;
        }
      }
    };

    static ZipJSON = class ZipJSON extends Base64 {
      override encode(obj: unknown): string {
        return super.encode(Zlib.Deflate.deflate(RubyCompat.JSON.dump(obj)));
      }

      override decode(str: string | null): unknown {
        try {
          if (!isTruthy(str)) return null;
          return RubyCompat.JSON.parse(Zlib.Inflate.inflate(super.decode(str!) as string));
        } catch {
          return null;
        }
      }
    };
  };

  static Identity = class Identity {
    encode<T>(str: T): T {
      return str;
    }
    decode<T>(str: T): T {
      return str;
    }
  };

  static Marshal = class Marshal {
    encode(str: unknown): string {
      return RubyCompat.Marshal.dump(str);
    }

    decode(str: string | null): unknown {
      if (isTruthy(str)) return RubyCompat.Marshal.load(str);
      return null;
    }
  };

  static SessionId = class SessionId extends DelegateClass(SessionSessionId) {
    /** @internal */
    _cookieValue: string;

    override get cookieValue(): string {
      return this._cookieValue;
    }

    constructor(sessionId: unknown, cookieValue: string) {
      super(sessionId);
      this._cookieValue = cookieValue;
    }
  };

  readonly coder: Coder;
  readonly encryptors: Encryptor[];
  private legacyHmac: unknown;
  private legacyHmacSecret: unknown;
  private legacyHmacCoder: Coder | undefined;

  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    const secrets = rbFArray(options["secrets"] || options["secret"]);

    const encryptorOpts = {
      purpose: options["key"],
      serializeJson: options["serializeJson"],
    } as EncryptorOptions;

    super(app, {
      ...options,
      coder: options["coder"] || new Cookie.Base64.Marshal(),
      cookieOnly: true,
    });

    this.encryptors = secrets.map((secret) => new Encryptor(secret, encryptorOpts));

    if ("legacyHmacSecret" in options || "secret" in options) {
      this.legacyHmac = fetch(options, "legacyHmac", "SHA1");

      this.legacyHmacSecret = options["legacyHmacSecret"] || options["secret"];
      this.legacyHmacCoder = fetch(options, "legacyHmacCoder", new Cookie.Base64.Marshal());
    } else {
      this.legacyHmac = false;
    }

    if (!isTruthy(this.isSecure(options))) {
      warn(`        SECURITY WARNING: No secret option provided to Rack::Session::Cookie.
        This poses a security threat. It is strongly recommended that you
        provide a secret to prevent exploits that may be possible from crafted
        cookies. This will not be supported in future versions of Rack, and
        future versions will even invalidate your existing user cookies.

        Called from: ${rbFCaller()[0]}.
`);
    }

    this.coder = (options["coder"] ||= this.defaultOptions["coder"]) as Coder;
  }

  /** @internal */
  override findSession(req: PersistedRequest, _sid: unknown): [unknown, Record<string, unknown>] {
    let data = this.unpackedCookieData(req);
    data = this.persistentSessionIdBang(data);
    return [hashAref(data, "session_id"), data as Record<string, unknown>];
  }

  /** @internal */
  override extractSessionId(request: PersistedRequest): SessionSessionId | null | false {
    const data = this.unpackedCookieData(request);
    return (data == null ? null : hashAref(data, "session_id")) as SessionSessionId | null;
  }

  /** @internal */
  private unpackedCookieData(request: PersistedRequest): object {
    return (
      request as unknown as { fetchHeader(name: string, block: (k: string) => object): object }
    ).fetchHeader(RACK_SESSION_UNPACKED_COOKIE_DATA, (k) => {
      let sessionData: unknown = null;
      const cookieData = request.cookies[this.key] as string | undefined;
      if (isTruthy(cookieData)) {
        for (const encryptor of this.encryptors) {
          try {
            sessionData = encryptor.decrypt(cookieData!);
            break;
          } catch (error) {
            if (!(error instanceof Encryptor.Error)) throw error;
            (request.env[RACK_ERRORS] as RackErrors).puts(
              `Session cookie encryptor error: ${error.message}`,
            );

            continue;
          }
        }

        if (!isTruthy(sessionData) && isTruthy(this.legacyHmacSecret)) {
          let digest: string;
          [sessionData, , digest] = rbStrRpartition(cookieData!, "--");
          if (!this.isLegacyDigestMatch(sessionData as string, digest)) sessionData = null;

          sessionData = this.legacyHmacCoder!.decode(sessionData);
        } else if (!isTruthy(sessionData) && isTruthy(this.coder)) {
          sessionData = this.coder.decode(cookieData);
        }
      }

      return request.setHeader(k, isTruthy(sessionData) ? sessionData : {}) as object;
    });
  }

  /** @internal */
  private persistentSessionIdBang(data: object | null, sid: unknown = null): object {
    data ||= {};
    if (!isTruthy(hashAref(data, "session_id"))) {
      hashAset(data, "session_id", isTruthy(sid) ? sid : this.generateSid());
    }
    return data;
  }

  /** @internal */
  override async writeSession(
    req: PersistedRequest,
    sessionId: unknown,
    session: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<unknown> {
    session = { ...session, session_id: sessionId };
    const sessionData = this.encodeSessionData(session) as string;

    if (strlen(sessionData) > 4096 - strlen(this.key)) {
      (req.getHeader(RACK_ERRORS) as unknown as RackErrors).puts(
        "Warning! Rack::Session::Cookie data size exceeds 4K.",
      );
      return null;
    } else {
      return new Cookie.SessionId(sessionId, sessionData);
    }
  }

  /** @internal */
  override async deleteSession(
    _req: PersistedRequest,
    _sessionId: unknown,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    if (!isTruthy(options["drop"])) return this.generateSid();
    return null;
  }

  /** @internal */
  private isLegacyDigestMatch(data: string | null, digest: string | null): boolean {
    if (!(isTruthy(data) && isTruthy(digest))) return false;

    return Utils.secureCompare(digest!, this.legacyGenerateHmac(data!));
  }

  /** @internal */
  private legacyGenerateHmac(data: string): string {
    return OpenSSL.HMAC.hexdigest(this.legacyHmac as string, this.legacyHmacSecret as string, data);
  }

  /** @internal */
  private encodeSessionData(session: Record<string, unknown>): unknown {
    if (this.encryptors.length === 0) {
      return this.coder.encode(session);
    } else {
      return this.encryptors[0].encrypt(session);
    }
  }

  /** @internal */
  private isSecure(options: Record<string, unknown>): unknown {
    return (
      this.encryptors.length !== 0 ||
      this.legacyHmac ||
      (options["coder"] && options["letCoderHandleSecureEncoding"])
    );
  }
}

registerConstant("Rack::Session::Cookie", Cookie);
registerConstant("Rack::Session::Cookie::Base64", Cookie.Base64);
registerConstant("Rack::Session::Cookie::Base64::Marshal", Cookie.Base64.Marshal);
registerConstant("Rack::Session::Cookie::Base64::JSON", Cookie.Base64.JSON);
registerConstant("Rack::Session::Cookie::Base64::ZipJSON", Cookie.Base64.ZipJSON);
registerConstant("Rack::Session::Cookie::Identity", Cookie.Identity);
registerConstant("Rack::Session::Cookie::Marshal", Cookie.Marshal);
registerConstant("Rack::Session::Cookie::SessionId", Cookie.SessionId);
