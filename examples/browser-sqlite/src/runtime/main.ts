import { Temporal } from "@js-temporal/polyfill";
import { Buffer } from "buffer";

if (!("Temporal" in globalThis)) Object.assign(globalThis, { Temporal });
if (!("Buffer" in globalThis)) Object.assign(globalThis, { Buffer });

const session = new URLSearchParams(location.search).get("session") ?? "0";
const moduleBase = `/rt/${session}/vfs/`;
const pkgBase = `/rt/${session}/pkg/`;

type HostMessage = {
  type: "host:files";
  files: Record<string, string>;
  db: Uint8Array | null;
  cookies?: Record<string, string>;
};

function post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
  parent.postMessage(message, location.origin, transfer);
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    post({ type: "console", level, text: format(args) });
  };
}
addEventListener("error", (e) =>
  post({ type: "console", level: "error", text: format([e.error ?? e.message]) }),
);
addEventListener("unhandledrejection", (e) =>
  post({ type: "console", level: "error", text: format(["Unhandled rejection:", e.reason]) }),
);

const status = (text: string) => post({ type: "status", text });

const files = await new Promise<HostMessage>((resolve) => {
  addEventListener("message", function listen(event: MessageEvent) {
    if (event.origin !== location.origin || event.data?.type !== "host:files") return;
    removeEventListener("message", listen);
    resolve(event.data as HostMessage);
  });
  post({ type: "runtime:waiting" });
});

status("Loading SQLite (sql.js)…");
const sqlite = await import("./expo-sqlite-sqljs.ts");
sqlite.seedDatabase("browser.db", files.db);
(globalThis as { __expoSqlite?: unknown }).__expoSqlite = sqlite;

const { VirtualFs } = await import("./vfs.ts");
const vfs = new VirtualFs(files.files);
const logOffsets = new Map<string, number>();
vfs.onWrite = (path) => {
  if (!path.startsWith("/log/") || !path.endsWith(".log")) return;
  const text = vfs.get(path) ? vfs.readText(path) : "";
  const from = logOffsets.get(path) ?? 0;
  logOffsets.set(path, text.length);
  const added = text.slice(from).replace(/\n$/, "");
  if (added) post({ type: "console", level: "log", text: added });
};
const { installHost } = await import("./host.ts");
installHost(vfs, moduleBase, (level, text) => post({ type: "console", level, text }));
(await import("./crypto.ts")).installCrypto();

status("Loading trails…");
const { PACKAGES, loadPackages, packageShim, transpile } = await import("./modules.ts");
await loadPackages();
await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
const { installTemplateCompiler } = await import("./template-compiler.ts");
installTemplateCompiler();
const { requestToRackEnvWithBody, rackResponseToFetchResponse } =
  await import("../../../serverless-lambda/serverless/rack-bridge.ts");

const { CookieJar } = await import("./cookie-jar.ts");
const cookies = new CookieJar(files.cookies ?? {});

let serialize: Promise<unknown> = Promise.resolve();
/** One request at a time: the browser has no AsyncLocalStorage to keep two apart. */
function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = serialize.then(fn);
  serialize = run.catch(() => undefined);
  return run;
}

type SwRequest = {
  type: "sw:request";
  method: string;
  url: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
};

const NULL_BODY = new Set([101, 204, 205, 304]);

function respond(
  port: MessagePort,
  status: number,
  headers: [string, string][],
  body: ArrayBuffer | string | null,
) {
  port.postMessage({ status, headers, body: NULL_BODY.has(status) ? null : body });
}

let app: { call(env: unknown): Promise<unknown> } | null = null;
let bootError: unknown = null;

async function handle(request: SwRequest, port: MessagePort): Promise<void> {
  const url = new URL(request.url);
  if (url.pathname.startsWith(moduleBase)) {
    const path = `/${decodeURIComponent(url.pathname.slice(moduleBase.length))}`;
    try {
      const js = transpile(vfs.readText(path), path, pkgBase);
      respond(port, 200, [["content-type", "text/javascript; charset=utf-8"]], js);
    } catch (e) {
      respond(port, 404, [["content-type", "text/plain"]], String(e));
    }
    return;
  }
  if (url.pathname.startsWith(pkgBase)) {
    const shim = packageShim(decodeURIComponent(url.pathname.slice(pkgBase.length)));
    if (shim == null) {
      const name = decodeURIComponent(url.pathname.slice(pkgBase.length));
      console.error(
        `Cannot import "${name}": the browser runtime bundles only ${Object.keys(PACKAGES).join(", ")}`,
      );
      respond(port, 404, [["content-type", "text/plain"]], `unknown package ${name}`);
      return;
    }
    respond(port, 200, [["content-type", "text/javascript; charset=utf-8"]], shim);
    return;
  }
  if (!app) {
    const text = bootError
      ? `<h1>trails failed to boot</h1><pre>${escapeHtml(format([bootError]))}</pre>`
      : "<p>trails is booting…</p>";
    respond(port, 503, [["content-type", "text/html; charset=utf-8"]], text);
    return;
  }
  const fetchRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  await serially(async () => {
    const started = performance.now();
    try {
      const env = await requestToRackEnvWithBody(fetchRequest, "/preview");
      env.REMOTE_ADDR = "127.0.0.1";
      const cookie = cookies.header();
      if (cookie) env.HTTP_COOKIE = cookie;
      const rack = (await app!.call(env)) as Parameters<typeof rackResponseToFetchResponse>[0];
      const setCookie = rack[1]["set-cookie"] ?? rack[1]["Set-Cookie"];
      if (setCookie != null) {
        for (const line of [setCookie].flat().flatMap((v) => String(v).split("\n")))
          cookies.store(line);
        post({ type: "cookies", cookies: cookies.entries() });
      }
      const response = await rackResponseToFetchResponse(rack);
      const body = await response.arrayBuffer();
      respond(port, response.status, [...response.headers], body);
      post({
        type: "request",
        text: `${request.method} ${url.pathname.replace(/^\/preview/, "") || "/"}${url.search} → ${response.status} (${Math.round(performance.now() - started)}ms)`,
      });
    } catch (e) {
      console.error(e);
      respond(
        port,
        500,
        [["content-type", "text/html; charset=utf-8"]],
        `<pre>${escapeHtml(format([e]))}</pre>`,
      );
    }
    const bytes = sqlite.exportDatabase("browser.db");
    if (bytes) post({ type: "db", bytes }, [bytes.buffer]);
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

navigator.serviceWorker.addEventListener("message", (event) => {
  if (event.data?.type === "sw:request")
    void handle(event.data as SwRequest, event.ports[0]).catch((e) => console.error(e));
});
await new Promise<void>((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => resolve();
  navigator.serviceWorker.controller!.postMessage({ type: "runtime:hello" }, [channel.port2]);
});

try {
  status("Booting the application…");
  const { Trails } =
    (await import("@blazetrails/trailties")) as typeof import("@blazetrails/trailties");
  await import(/* @vite-ignore */ `${moduleBase}config/environment.ts`);
  status("Running migrations…");
  const { Base } = await import("@blazetrails/activerecord");
  await Base.connectionPool().migrationContext.migrate();
  app = Trails.application;
  status("Running");
  post({ type: "booted" });
} catch (e) {
  bootError = e;
  console.error("Boot failed:", e);
  status("Boot failed");
  post({ type: "boot-failed" });
}
