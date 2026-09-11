import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Handler, bodyFromString } from "@blazetrails/rack";
import type { RackApp } from "@blazetrails/rack";
import { getHttpAsync } from "@blazetrails/ruby-compat";
import type { HttpServer } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/activerecord";

function connectionLease(): object {
  return (Base.connectionPool() as unknown as { connectionLease(): object }).connectionLease();
}

function gatedApp(leases: object[]): RackApp {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return async () => {
    leases.push(connectionLease());
    if (leases.length === 2) release();
    await gate;
    return [200, {}, bodyFromString("")];
  };
}

function urlOf(server: HttpServer): string {
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  return `http://127.0.0.1:${port}/`;
}

async function twoConcurrentRequests(url: string): Promise<void> {
  await Promise.all([fetch(url), fetch(url)].map(async (r) => (await r).text()));
}

describe("request thread per Handler.Node#service (trails)", () => {
  beforeEach(async () => {
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  });

  afterEach(async () => {
    await Base.removeConnection();
  });

  it("gives two concurrent requests distinct leases through Handler.Node.run", async () => {
    const leases: object[] = [];
    const server = await Handler.Node.run(gatedApp(leases), { Port: 0, Host: "127.0.0.1" });
    try {
      await twoConcurrentRequests(urlOf(server));
    } finally {
      await Handler.Node.shutdown();
    }

    expect(leases).toHaveLength(2);
    expect(leases[0]).not.toBe(leases[1]);
    expect(leases).not.toContain(connectionLease());
  });

  it("gives two concurrent requests distinct leases through handler.service", async () => {
    const leases: object[] = [];
    const handler = new Handler.Node(gatedApp(leases));
    const http = await getHttpAsync();
    const server = http.createServer((req, res) => void handler.service(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      await twoConcurrentRequests(urlOf(server));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(leases).toHaveLength(2);
    expect(leases[0]).not.toBe(leases[1]);
    expect(leases).not.toContain(connectionLease());
  });
});
