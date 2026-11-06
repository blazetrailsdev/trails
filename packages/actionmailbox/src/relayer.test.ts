import { createServer, type IncomingHttpHeaders } from "node:http";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Errno, File, Net, SocketError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Relayer } from "./relayer.js";

class RelayerTest extends TestCase {}
RelayerTest.fileFixturePath = File.expandPath("test-helpers/fixtures/files", import.meta.dirname);

const INGRESS_PASSWORD = "secret";

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

describe("ActionMailbox::RelayerTest", () => {
  let URL: string;
  let relayer: Relayer;
  let requests: RecordedRequest[];
  let closeServer: () => Promise<void>;

  const fileFixture = (name: string) => new RelayerTest("fileFixture").fileFixture(name);

  async function stubRequest(status: number): Promise<void> {
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        requests.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(status);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeServer = () => new Promise((resolve) => server.close(() => resolve()));
    const { port } = server.address() as { port: number };
    URL = `http://127.0.0.1:${port}/rails/action_mailbox/relay/inbound_emails`;
    relayer = new Relayer({ url: URL, password: INGRESS_PASSWORD });
  }

  function stubRaise(error: Error): void {
    const client = new Net.HTTP("example.com", 443);
    client.post = () => Promise.reject(error);
    (relayer as unknown as { _client: unknown })._client = client;
  }

  beforeEach(() => {
    URL = "https://example.com/rails/action_mailbox/relay/inbound_emails";
    requests = [];
    closeServer = async () => {};
    relayer = new Relayer({ url: URL, password: INGRESS_PASSWORD });
  });

  afterEach(async () => {
    await closeServer();
  });

  it("successfully relaying an email", async () => {
    await stubRequest(204);

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("2.0.0");
    expect(result.message).toBe("Successfully relayed message to ingress");
    expect(result.isSuccess()).toBe(true);
    expect(result.isFailure()).toBe(false);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.method).toBe("POST");
    expect(`http://${request.headers.host}${request.url}`).toBe(URL);
    expect(request.body).toBe(await fileFixture("welcome.eml").read());
    expect(request.headers.authorization).toBe(
      `Basic ${btoa(`actionmailbox:${INGRESS_PASSWORD}`)}`,
    );
    expect(request.headers["content-type"]).toBe("message/rfc822");
    expect(request.headers["user-agent"]).toMatch(/^Action Mailbox relayer v\d+\./);
  });

  it("unsuccessfully relaying with invalid credentials", async () => {
    await stubRequest(401);

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.7.0");
    expect(result.message).toBe("Invalid credentials for ingress");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to an unspecified server error", async () => {
    await stubRequest(500);

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.0.0");
    expect(result.message).toBe("HTTP 500");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to a gateway timeout", async () => {
    await stubRequest(504);

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.0.0");
    expect(result.message).toBe("HTTP 504");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to ECONNRESET", async () => {
    stubRaise(new Errno.ECONNRESET());

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.4.2");
    expect(result.message).toBe("Network error relaying to ingress: Connection reset by peer");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to connection failure", async () => {
    stubRaise(new SocketError("Failed to open TCP connection to example.com:443"));

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.4.2");
    expect(result.message).toBe(
      "Network error relaying to ingress: Failed to open TCP connection to example.com:443",
    );
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to client-side timeout", async () => {
    stubRaise(new Net.OpenTimeout("execution expired"));

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.4.2");
    expect(result.message).toBe("Timed out relaying to ingress");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });

  it("unsuccessfully relaying due to an unhandled exception", async () => {
    stubRaise(new Error("Something went wrong"));

    const result = await relayer.relay(await fileFixture("welcome.eml").read());
    expect(result.statusCode).toBe("4.0.0");
    expect(result.message).toBe("Error relaying to ingress: Something went wrong");
    expect(result.isSuccess()).toBe(false);
    expect(result.isFailure()).toBe(true);
  });
});
