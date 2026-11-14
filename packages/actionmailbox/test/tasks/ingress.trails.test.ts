import { createServer, type Server } from "node:http";
import { Task } from "@blazetrails/rake";
import { STDIN, SystemExit, getProcessAdapter, setEnv } from "@blazetrails/ruby-compat";
import { Relayer } from "../../lib/relayer.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("ActionMailbox ingress tasks", () => {
  let server: Server;
  let status: number;
  let output: string;

  beforeAll(async () => {
    await import("../../lib/tasks/ingress.js");
  });

  beforeEach(async () => {
    status = 204;
    output = "";
    server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        const authorized = req.headers.authorization === `Basic ${btoa("actionmailbox:secret")}`;
        res.writeHead(authorized ? status : 401);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    setEnv("URL", `http://127.0.0.1:${port}/rails/action_mailbox/relay/inbound_emails`);
    setEnv("INGRESS_PASSWORD", "secret");
    vi.spyOn(STDIN, "readAsync").mockResolvedValue("From: a@example.com\r\n\r\nHi" as never);
    const adapter = getProcessAdapter();
    vi.spyOn(adapter.stdout, "write").mockImplementation((chunk: unknown) => {
      output += String(chunk);
      return true;
    });
    vi.spyOn(adapter, "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setEnv("URL", undefined);
    setEnv("INGRESS_PASSWORD", undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function run(name: string): Promise<number> {
    const task = await Task.get(`action_mailbox:ingress:${name}`);
    try {
      await task.execute();
    } catch (error) {
      if (error instanceof SystemExit) return error.status;
      throw error;
    }
    throw new Error("task did not exit");
  }

  it("postfix relays and exits successfully", async () => {
    expect(await run("postfix")).toBe(0);
    expect(output).toBe("2.0.0 Successfully relayed message to ingress");
  });

  it("postfix exits 1 with 4.3.5 when INGRESS_PASSWORD is blank", async () => {
    setEnv("INGRESS_PASSWORD", "");
    expect(await run("postfix")).toBe(1);
    expect(output).toBe("4.3.5 URL and INGRESS_PASSWORD are required");
  });

  it("postfix exits 1 on invalid credentials", async () => {
    setEnv("INGRESS_PASSWORD", "wrong");
    expect(await run("postfix")).toBe(1);
    expect(output).toBe("4.7.0 Invalid credentials for ingress");
  });

  it("exim relays and exits 0", async () => {
    expect(await run("exim")).toBe(0);
    expect(output).toBe("Successfully relayed message to ingress");
  });

  it("exim exits 64 when URL is blank", async () => {
    setEnv("URL", undefined);
    expect(await run("exim")).toBe(64);
    expect(output).toBe("URL and INGRESS_PASSWORD are required");
  });

  it("exim exits 75 on a transient failure", async () => {
    status = 500;
    expect(await run("exim")).toBe(75);
    expect(output).toBe("HTTP 500");
  });

  it("exim exits 69 on a permanent failure", async () => {
    vi.spyOn(Relayer.prototype, "relay").mockResolvedValue(new Relayer.Result("5.0.0", "Rejected"));
    expect(await run("exim")).toBe(69);
    expect(output).toBe("Rejected");
  });

  it("postfix prints the status code on a transient failure", async () => {
    status = 500;
    expect(await run("postfix")).toBe(1);
    expect(output).toBe("4.0.0 HTTP 500");
  });

  it("qmail exits 111 when URL is blank", async () => {
    setEnv("URL", "");
    expect(await run("qmail")).toBe(111);
    expect(output).toBe("URL and INGRESS_PASSWORD are required");
  });

  it("qmail relays and exits 0", async () => {
    expect(await run("qmail")).toBe(0);
    expect(output).toBe("Successfully relayed message to ingress");
  });

  it("qmail exits 111 on a transient failure", async () => {
    status = 500;
    expect(await run("qmail")).toBe(111);
    expect(output).toBe("HTTP 500");
  });

  it("qmail exits 100 on a permanent failure", async () => {
    vi.spyOn(Relayer.prototype, "relay").mockResolvedValue(new Relayer.Result("5.0.0", "Rejected"));
    expect(await run("qmail")).toBe(100);
    expect(output).toBe("Rejected");
  });
});
