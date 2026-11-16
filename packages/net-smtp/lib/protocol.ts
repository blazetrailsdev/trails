import { isIP } from "node:net";
import { checkServerIdentity, rootCertificates, type PeerCertificate } from "node:tls";
import type SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import { OpenSSL, StandardError, Timeout, TopLevel } from "@blazetrails/ruby-compat";
import type { SMTP, SMTPAuthenticationError } from "./smtp.js";

type SSLSocket = InstanceType<
  typeof OpenSSL.SSL.SSLSocket<
    SMTPConnection & {
      options: { tls?: object };
      _upgradeConnection(callback: (err: Error | null) => void): void;
    }
  >
>;

const TLS_VERSIONS: Record<number, "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3"> = {
  0x301: "TLSv1",
  0x302: "TLSv1.1",
  0x303: "TLSv1.2",
  0x304: "TLSv1.3",
};

/** @noRailsEquivalent PERMANENT */
export const Net: {
  Protocol?: typeof Protocol;
  SMTP?: typeof SMTP;
  SMTPAuthenticationError?: typeof SMTPAuthenticationError;
} = {};
TopLevel.Net = Net;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Net?: typeof Net;
  }
}

/** @noRailsEquivalent PERMANENT */
export class Protocol {
  static readonly VERSION: string = "0.2.2";

  /** @internal */
  protected async sslSocketConnect(s: SSLSocket, timeout: number | null): Promise<void> {
    if (timeout != null) {
      if (timeout <= 0) throw new OpenTimeout();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        connect(s),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new OpenTimeout()), timeout * 1000);
        }),
      ]).finally(() => clearTimeout(timer));
    } else {
      await connect(s);
    }
  }
}
Net.Protocol = Protocol;

/** @noRailsEquivalent PERMANENT */
export class ProtocolError extends StandardError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoSyntaxError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoFatalError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoUnknownError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoServerError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class ProtoAuthError extends ProtocolError {}
/** @noRailsEquivalent PERMANENT */
export class OpenTimeout extends Timeout.Error {}
/** @noRailsEquivalent PERMANENT */
export class ReadTimeout extends Timeout.Error {}

/** @noRailsEquivalent CONVERGEABLE ruby-compat-ssl-socket-connect */
async function connect(s: SSLSocket): Promise<void> {
  const { io, context } = s;
  const hostname = s.hostname!;
  const store = context.certStore;
  const ca =
    store == null || store._certs.length === 0
      ? null
      : store._defaultPaths
        ? [...rootCertificates, ...store._certs]
        : store._certs;
  io.options.tls = {
    ...(ca != null ? { ca } : {}),
    rejectUnauthorized: context.verifyMode !== OpenSSL.SSL.VERIFY_NONE,
    secureOptions: context.options,
    ...(context.minVersion != null ? { minVersion: TLS_VERSIONS[context.minVersion] } : {}),
    ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
    checkServerIdentity: (_host: string, cert: PeerCertificate) =>
      context.verifyHostname ? checkServerIdentity(hostname, cert) : undefined,
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        io.removeListener("error", reject);
        io.removeListener("end", cleanup);
      };
      io.once("error", reject);
      io.once("end", cleanup);
      io._upgradeConnection((err) => {
        cleanup();
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (e) {
    const err = e as Error & { code?: string; originalCode?: string };
    if (err.originalCode != null) err.code = err.originalCode;
    s._setVerifyResult(err.code);
    throw err;
  }
}
