import { describe, it, expect, afterEach } from "vitest";
import http from "http";
import { Server } from "./server.js";

describe("ActionDispatch::SystemTesting::Server", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await server?.stop();
    server = undefined;
    Server.silencePuma = false;
  });

  it("boots an app on a random port", async () => {
    const app = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    server = new Server();
    await server.run(app);
    expect(server.port).toBeGreaterThan(0);
    expect(server.host).toBe("127.0.0.1");
  });

  it("stops the server and resets port", async () => {
    const app = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    server = new Server();
    await server.run(app);
    await server.stop();
    expect(server.port).toBe(0);
    server = undefined;
  });

  it("has configurable silence_puma class attribute", () => {
    expect(Server.silencePuma).toBe(false);
    Server.silencePuma = true;
    expect(Server.silencePuma).toBe(true);
  });
});
