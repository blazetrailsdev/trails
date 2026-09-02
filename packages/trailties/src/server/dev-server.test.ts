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
