import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { bodyFromString } from "@blazetrails/rack";
import type { RackApp } from "@blazetrails/actionpack";
import { build } from "vite";
import { AppGenerator } from "../generators/app-generator.js";
import { DevServer } from "./dev-server.js";

const rackApp: RackApp = async () => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("from rack"),
];

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
  it("serves the Rack app at / with the generated vite.config in place", async () => {
    const origin = await startOn(await generateApp());

    const response = await fetch(`${origin}/`, { redirect: "manual" });

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

  it("serves the generated stylesheet the layout links to", async () => {
    const origin = await startOn(await generateApp());

    const response = await fetch(`${origin}/assets/stylesheets/application.css`);

    expect(response.status).toBe(200);
  }, 30_000);
});
