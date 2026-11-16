import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { createServer as createHttpsServer } from "node:https";
import { OpenSSL, Tempfile } from "@blazetrails/ruby-compat";
import { gzipSync } from "node:zlib";

export async function withRawBackend(
  handler: (client: Socket) => unknown,
  block: (backend: string) => Promise<void>,
): Promise<void> {
  const clients = new Set<Socket>();
  const threads: Promise<void>[] = [];
  const server = createTcpServer((client) => {
    clients.add(client);
    let head = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf("\r\n\r\n");
      if (end === -1) return;
      client.off("data", onData);
      client.pause();
      client.unshift(head.subarray(end + 4));
      client.on("error", () => {});
      threads.push(Promise.resolve(handler(client)).finally(() => client.end()) as Promise<void>);
    };
    client.on("data", onData);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await block(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    for (const client of clients) client.destroy();
    await Promise.allSettled(threads);
    server.close();
  }
}

export const GZIP_PLAINTEXT = "the quick brown fox ".repeat(32);

export function gzip(string: string): Uint8Array {
  return gzipSync(string);
}

type Proc = (req: IncomingMessage, res: ServerResponse) => void;

function mountRoutes(server: Server, procs: Map<string, Proc>): void {
  server.on("request", (req, res) => {
    const proc = procs.get(req.url ?? "");
    if (proc !== undefined) return proc(req, res);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    switch (url.pathname) {
      case "/cookies/set":
        res.setHeader("Set-Cookie", `test=${url.searchParams.get("test") ?? "1"}`);
        res.end("cookie set");
        return;
      case "/echo-headers":
        res.setHeader("x-custom", "value-here");
        res.end("ok");
        return;
      case "/echo-request-headers":
        res.setHeader("Content-Type", "text/plain");
        res.end(
          ["cookie", "authorization", "x-forwarded-for"]
            .filter((name) => req.headers[name] != null)
            .map((name) => `${name}: ${req.headers[name]}`)
            .join("\n"),
        );
        return;
      case "/chunked":
        res.setHeader("Content-Type", "text/plain");
        res.write("chunk-one ");
        res.end("chunk-two");
        return;
      case "/echo-body": {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => res.end(Buffer.concat(chunks)));
        return;
      }
      case "/no-content":
        res.statusCode = 204;
        res.end();
        return;
      case "/not-modified":
        res.statusCode = 304;
        res.end();
        return;
      case "/empty":
        res.end("");
        return;
      case "/gzip": {
        const body = gzip(GZIP_PLAINTEXT);
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Encoding": "gzip",
          "Content-Length": body.length,
        });
        res.end(body);
        return;
      }
      default: {
        const body =
          "<!doctype html><html><head><title>Example Domain</title></head>" +
          "<body><h1>Example Domain</h1><p>Local rack-proxy test fixture.</p></body></html>";
        res.writeHead(200, {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Length": new TextEncoder().encode(body).length,
        });
        res.end(body);
      }
    }
  });
}

export interface TestServer {
  port: number;
  mountProc(path: string, proc: Proc): void;
  shutdown(): Promise<void>;
}

export async function startServer({
  ssl = false,
  caSigned = false,
}: { ssl?: boolean; caSigned?: boolean } = {}): Promise<[TestServer, number]> {
  let server: Server;
  if (ssl) {
    const [cert, key] = caSigned ? caSignedCert() : selfSignedCert();
    server = createHttpsServer({ cert: cert.toPem(), key: key.toPem() }) as unknown as Server;
  } else {
    server = createServer();
  }
  const procs = new Map<string, Proc>();
  mountRoutes(server, procs);
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => sockets.add(s));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const shutdown = () =>
    new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return [{ port, mountProc: (path, proc) => procs.set(path, proc), shutdown }, port];
}

type Certificate = InstanceType<typeof OpenSSL.X509.Certificate>;
type RSA = InstanceType<typeof OpenSSL.PKey.RSA>;
let _selfSignedCert: [Certificate, RSA] | undefined;
let _certificateAuthority: [Certificate, RSA] | undefined;
let _caSignedCert: [Certificate, RSA] | undefined;
let _caFile: string | undefined;

export function selfSignedCert(): [Certificate, RSA] {
  return (_selfSignedCert ??= (() => {
    const key = new OpenSSL.PKey.RSA(2048);
    const cert = new OpenSSL.X509.Certificate();
    const name = OpenSSL.X509.Name.parse("/CN=127.0.0.1");
    cert.version = 2;
    cert.serial = 1;
    cert.subject = name;
    cert.issuer = name;
    cert.publicKey = key.publicKey;
    cert.notBefore = new Date(Date.now() - 3600 * 1000);
    cert.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    const ef = new OpenSSL.X509.ExtensionFactory();
    ef.subjectCertificate = cert;
    ef.issuerCertificate = cert;
    cert.addExtension(ef.createExtension("basicConstraints", "CA:TRUE", true));
    cert.addExtension(ef.createExtension("subjectAltName", "IP:127.0.0.1,DNS:localhost", false));
    cert.sign(key, OpenSSL.Digest.SHA256);

    return [cert, key] as [Certificate, RSA];
  })());
}

export function certificateAuthority(): [Certificate, RSA] {
  return (_certificateAuthority ??= (() => {
    const key = new OpenSSL.PKey.RSA(2048);
    const cert = new OpenSSL.X509.Certificate();
    const name = OpenSSL.X509.Name.parse("/CN=rack-proxy-test-ca");
    cert.version = 2;
    cert.serial = 1;
    cert.subject = name;
    cert.issuer = name;
    cert.publicKey = key.publicKey;
    cert.notBefore = new Date(Date.now() - 3600 * 1000);
    cert.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    const ef = new OpenSSL.X509.ExtensionFactory();
    ef.subjectCertificate = cert;
    ef.issuerCertificate = cert;
    cert.addExtension(ef.createExtension("basicConstraints", "CA:TRUE", true));
    cert.addExtension(ef.createExtension("keyUsage", "keyCertSign, cRLSign", true));
    cert.sign(key, OpenSSL.Digest.SHA256);

    return [cert, key] as [Certificate, RSA];
  })());
}

export function caSignedCert(): [Certificate, RSA] {
  return (_caSignedCert ??= (() => {
    const [caCert, caKey] = certificateAuthority();
    const key = new OpenSSL.PKey.RSA(2048);
    const cert = new OpenSSL.X509.Certificate();
    cert.version = 2;
    cert.serial = 2;
    cert.subject = OpenSSL.X509.Name.parse("/CN=127.0.0.1");
    cert.issuer = caCert.subject;
    cert.publicKey = key.publicKey;
    cert.notBefore = new Date(Date.now() - 3600 * 1000);
    cert.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    const ef = new OpenSSL.X509.ExtensionFactory();
    ef.subjectCertificate = cert;
    ef.issuerCertificate = caCert;
    cert.addExtension(ef.createExtension("basicConstraints", "CA:FALSE", true));
    cert.addExtension(ef.createExtension("subjectAltName", "IP:127.0.0.1,DNS:localhost", false));
    cert.sign(caKey, OpenSSL.Digest.SHA256);

    return [cert, key] as [Certificate, RSA];
  })());
}

let _caFileTempfile: Tempfile | undefined;

export function caFile(): string {
  return (_caFile ??= (() => {
    const [caCert] = certificateAuthority();
    const file = Tempfile.new(["rack-proxy-test-ca", ".pem"]);
    file.write(caCert.toPem());
    file.flush();
    _caFileTempfile = file;
    return file.path()!;
  })());
}
