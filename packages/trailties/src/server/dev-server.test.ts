import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import { connect } from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RackApp } from "@blazetrails/actionpack";
import type { TCPSocket } from "@blazetrails/ruby-compat";
import { build } from "vite";
import { AppGenerator } from "../generators/app-generator.js";
import { DevServer } from "./dev-server.js";

const rackApp: RackApp = async (env) => {
  if (env["rack.hijack?"] && env.HTTP_UPGRADE === "websocket") {
    const io = (env["rack.hijack"] as () => TCPSocket)();
    io.write("HTTP/1.1 101 Switching Protocols\r\n\r\nfrom rack");
    io.closeWrite();
    return [-1, {}, [""]];
  }
  return [200, { "content-type": "text/plain" }, ["from rack"]];
};

function upgrade(origin: string, path: string, protocol?: string): Promise<string> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), hostname, () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: ${hostname}:${port}\r\n` +
          "Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "") +
          "\r\n",
      );
    });
    let received = "";
    socket.on("data", (chunk) => {
      received += chunk.toString();
      if (protocol && received.includes("\r\n\r\n")) socket.destroy();
    });
    socket.on("close", () => resolve(received));
    socket.on("error", reject);
  });
}

let tmpDir: string | undefined;
let server: DevServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function generateApp(): Promise<string> {
  tmpDir = fs.mkdtempSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "trails-dev-server-"),
  );
  await new AppGenerator({
    cwd: tmpDir,
    output: () => {},
    appPath: "my-app",
    database: "sqlite",
    skipDocker: true,
  }).run();
  return path.join(tmpDir, "my-app");
}

async function startOn(cwd: string): Promise<string> {
  server = new DevServer({ port: 0, host: "127.0.0.1", cwd, app: rackApp });
  await server.start();
  const address = (
    server as unknown as { server: { httpServer: { address(): { port: number } } } }
  ).server.httpServer.address();
  return `http://127.0.0.1:${address.port}`;
}

describe("DevServer", () => {
  it("hands a WebSocket upgrade to the Rack app and leaves Vite's to Vite", async () => {
    const origin = await startOn(await generateApp());

    expect(await upgrade(origin, "/cable")).toBe(
      "HTTP/1.1 101 Switching Protocols\r\n\r\nfrom rack",
    );
    const hmr = await upgrade(origin, "/", "vite-ping");
    expect(hmr.startsWith("HTTP/1.1 101")).toBe(true);
    expect(hmr).not.toContain("from rack");
  }, 30_000);

  it("serves the Rack app at / with the generated vite.config in place", async () => {
    const origin = await startOn(await generateApp());

    const response = await fetch(`${origin}/`, { redirect: "manual" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("from rack");
  }, 30_000);

  it("hands application source under app/ to Rack rather than serving it", async () => {
    const origin = await startOn(await generateApp());

    const response = await fetch(`${origin}/controllers/application-controller.ts`, {
      redirect: "manual",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("from rack");
  }, 30_000);

  it("builds the generated app's assets — rollupOptions.input resolves", async () => {
    const root = await generateApp();

    const result = (await build({
      root,
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "warn",
    })) as { output: { fileName: string }[] };

    expect(result.output.map((chunk) => chunk.fileName)).toContainEqual(
      expect.stringMatching(/application-.*\.css$/),
    );
  }, 60_000);

  it("builds into public/assets without copying public/ or doubling the assets path", async () => {
    const root = await generateApp();

    await build({
      root: path.join(root, "app"),
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "warn",
    });

    const outDir = path.join(root, "public", "assets");
    const emitted = fs
      .readdirSync(outDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(outDir, path.join(entry.parentPath, entry.name)));

    expect(emitted.filter((file) => !file.startsWith(".vite/"))).toEqual([
      expect.stringMatching(/^application-[^/]*\.css$/),
    ]);
    for (const copied of ["404.html", "422.html", "500.html", "robots.txt", "favicon.ico"]) {
      expect(emitted).not.toContain(copied);
      expect(fs.existsSync(path.join(root, "public", copied))).toBe(true);
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, ".vite/manifest.json"), "utf-8"));
    const file = manifest["assets/stylesheets/application.css"].file;
    expect(file).not.toContain("/");
    expect(fs.existsSync(path.join(outDir, file))).toBe(true);
  }, 60_000);

  it("serves the generated stylesheet the layout links to", async () => {
    const origin = await startOn(await generateApp());

    const response = await fetch(`${origin}/assets/stylesheets/application.css`);

    expect(response.status).toBe(200);
  }, 30_000);
});
