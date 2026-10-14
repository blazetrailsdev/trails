import { connect } from "node:net";
import { describe, expect, it } from "vitest";
import { getHttpAsync } from "./http-adapter.js";

describe("the Node HTTP adapter", () => {
  it("delivers an upgrade request to the server's upgrade listener with its socket and head", async () => {
    const http = await getHttpAsync();
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("ordinary");
    });
    const upgraded = new Promise<{ url: string | undefined; head: string }>((resolve) => {
      server.on("upgrade", (req, socket, head) => {
        resolve({ url: req.url, head: Buffer.from(head).toString() });
        socket.end("taken");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;

    const reply = await new Promise<string>((resolve) => {
      let text = "";
      const client = connect(port, "127.0.0.1", () => {
        client.write(
          `GET /cable HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
            "Connection: Upgrade\r\nUpgrade: websocket\r\n\r\nfirst-frame",
        );
      });
      client.on("data", (chunk) => {
        text += chunk.toString();
      });
      client.on("close", () => resolve(text));
    });

    expect(await upgraded).toEqual({ url: "/cable", head: "first-frame" });
    expect(reply).toBe("taken");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
