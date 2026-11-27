import { Temporal } from "@js-temporal/polyfill";
import { Buffer } from "buffer";
import { installRegExpModifiers } from "./regexp-modifiers.ts";

if (!("Temporal" in globalThis)) Object.assign(globalThis, { Temporal });
if (!("Buffer" in globalThis)) Object.assign(globalThis, { Buffer });
installRegExpModifiers();

const query = new URLSearchParams(location.search);
const session = query.get("session") ?? "0";
const tab = query.get("tab") ?? "0";
const previewPath = `${import.meta.env.BASE_URL}preview/${tab}`;
const moduleBase = `${import.meta.env.BASE_URL}rt/${tab}/${session}/vfs/`;
const pkgBase = `${import.meta.env.BASE_URL}rt/${tab}/${session}/pkg/`;

type SwRequest = {
  type: "sw:request";
  method: string;
  url: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
};

const waiting: [SwRequest, MessagePort][] = [];
let answer: ((request: SwRequest, port: MessagePort) => void) | null = null;
navigator.serviceWorker.addEventListener("message", (event) => {
  if (event.data?.type !== "sw:request") return;
  if (answer) answer(event.data as SwRequest, event.ports[0]);
  else waiting.push([event.data as SwRequest, event.ports[0]]);
});
navigator.serviceWorker.startMessages();

type HostMessage = {
  type: "host:files";
  files: Record<string, string>;
  db: Uint8Array | null;
  cookies?: Record<string, string>;
};

function post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
  parent.postMessage(message, location.origin, transfer);
}

/** Separates an error's app frames from the framework's, which the console folds away as Rails' debug page does. */
const FRAMEWORK_TRACE = "\n\u0000framework\n";

/**
 * An error and its trace. App frames name the file in the app
 * (`/app/models/post.ts:6:3`, through the module's inline source map);
 * framework frames come from bundle chunks, so they follow
 * {@link FRAMEWORK_TRACE} and the console shows them as "Framework Trace".
 */
function describe(e: Error): string {
  const head = `${e.name}: ${e.message}`;
  if (!e.stack) return head;
  const stack = e.stack.includes(e.message) ? e.stack : `${head}\n${e.stack}`;
  const app: string[] = [];
  const framework: string[] = [];
  const base = new URL(moduleBase, location.href).href;
  for (const line of stack.split("\n")) {
    const frame = /^\s+at |@/.test(line) && /:\d+:\d+\)?$/.test(line);
    if (!frame || line.includes(base)) app.push(line.replaceAll(base, "/"));
    else framework.push(line);
  }
  return framework.length ? `${app.join("\n")}${FRAMEWORK_TRACE}${framework.join("\n")}` : stack;
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return describe(a);
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

// A rejected top-level await is not reported as an error event in Safari, so
// a failed import would leave the status at "Loading…" with nothing logged.
function load<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((e: unknown) => {
    console.error("Boot failed:", e);
    status("Boot failed");
    post({ type: "boot-failed", text: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    throw e;
  });
}

status("Loading SQLite (sql.js)…");
const sqlite = await load(import("./expo-sqlite-sqljs.ts"));
sqlite.seedDatabase("browser.db", files.db);
(globalThis as { __expoSqlite?: unknown }).__expoSqlite = sqlite;

const { VirtualFs } = await load(import("./vfs.ts"));
const vfs = new VirtualFs(files.files);
const logOffsets = new Map<string, number>();
vfs.onWrite = (path) => {
  if (path.startsWith("/tmp/") && vfs.get(path)?.kind === "file") {
    post({ type: "tmp", path, text: vfs.readText(path) });
  }
  if (!path.startsWith("/log/") || !path.endsWith(".log")) return;
  const text = vfs.get(path) ? vfs.readText(path) : "";
  const from = logOffsets.get(path) ?? 0;
  logOffsets.set(path, text.length);
  const added = text.slice(from).replace(/\n$/, "");
  if (added) post({ type: "console", level: "log", text: added });
};
const { FRAMEWORK_ROOT, SEAT_FRAMEWORK_DIR } = await load(import("./package-names.ts"));
Object.assign(globalThis, {
  [SEAT_FRAMEWORK_DIR]: (dirname: string) => {
    const pkg = dirname.slice(FRAMEWORK_ROOT.length + 1).split("/")[0];
    vfs.write(`${FRAMEWORK_ROOT}/${pkg}/package.json`, "{}", false);
    vfs.mkdirp(dirname);
    return dirname;
  },
});
const { installHost } = await load(import("./host.ts"));
installHost(vfs, moduleBase, (level, text) => post({ type: "console", level, text }));
(await load(import("./crypto.ts"))).installCrypto();

status("Loading trails…");
const { PACKAGES, consoleLine, packageShim, syntaxErrors, transpile } = await load(
  import("./modules.ts"),
);
await load(import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js"));
const { installTemplateCompiler } = await load(import("./template-compiler.ts"));
installTemplateCompiler();
const { DebugView } = await load(import("@blazetrails/actionpack"));
const rescues = import.meta.glob(
  "../../../../packages/actionpack/lib/action-dispatch/middleware/templates/**/*.tse",
  { query: "?raw", import: "default", eager: true },
);
for (const [p, source] of Object.entries(rescues)) {
  const relative = p.slice(p.indexOf("/templates/") + "/templates/".length);
  vfs.write(`${DebugView.RESCUES_TEMPLATE_PATHS[0]}/${relative}`, source as string, false);
}
const info = import.meta.glob("../../../../packages/trailties/lib/templates/**/*.tse", {
  query: "?raw",
  import: "default",
  eager: true,
});
for (const [p, source] of Object.entries(info)) {
  const relative = p.slice(p.indexOf("/templates/"));
  vfs.write(`${FRAMEWORK_ROOT}/trailties/dist${relative}`, source as string, false);
}
const { rackEnv, rackResult } = await load(import("./rack-bridge.ts"));
const { generate, generatorModule } = await load(import("./generate.ts"));

const { CookieJar } = await load(import("./cookie-jar.ts"));
const cookies = new CookieJar(files.cookies ?? {});

let serialize: Promise<unknown> = Promise.resolve();
function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = serialize.then(fn, fn);
  serialize = run;
  return run;
}

const NULL_BODY = new Set([101, 204, 205, 304]);

function respond(
  port: MessagePort,
  status: number,
  headers: [string, string][],
  body: ArrayBuffer | Uint8Array | string | null,
) {
  port.postMessage({ status, headers, body: NULL_BODY.has(status) ? null : body });
}

type RackResponse = Parameters<typeof rackResult>[0];
let app: { call(env: unknown): Promise<unknown> } | null = null;
let bootError: unknown = null;

async function handle(request: SwRequest, port: MessagePort): Promise<void> {
  const url = new URL(request.url);
  if (url.pathname.startsWith(moduleBase)) {
    const path = `/${decodeURIComponent(url.pathname.slice(moduleBase.length))}`;
    try {
      const js = (await generatorModule(path)) ?? transpile(vfs.readText(path), path, pkgBase);
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
  await serially(async () => {
    const started = performance.now();
    try {
      const env = rackEnv(request.method, request.url, request.headers, request.body, previewPath);
      const cookie = cookies.header();
      if (cookie) env.HTTP_COOKIE = cookie;
      const response = await rackResult((await app!.call(env)) as RackResponse);
      const setCookies = response.headers.filter(([name]) => name.toLowerCase() === "set-cookie");
      if (setCookies.length) {
        for (const [, line] of setCookies) cookies.store(line);
        post({ type: "cookies", cookies: cookies.entries() });
      }
      respond(port, response.status, response.headers, response.body);
      post({
        type: "request",
        text: `${request.method} ${(url.pathname.startsWith(previewPath) ? url.pathname.slice(previewPath.length) : url.pathname) || "/"}${url.search} → ${response.status} (${Math.round(performance.now() - started)}ms)`,
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

answer = (request, port) => {
  handle(request, port).catch((e) => console.error(e));
};
for (const [request, port] of waiting.splice(0)) answer(request, port);

type HostRequest =
  | { type: "host:eval"; id: number; code: string }
  | { type: "host:tables"; id: number }
  | { type: "host:rows"; id: number; table: string }
  | { type: "host:generate"; id: number; args: string[] };

addEventListener("message", (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const request = event.data as HostRequest;
  const reply = (body: Record<string, unknown>) => post({ type: "reply", id: request.id, ...body });
  if (request.type === "host:eval") {
    serially(() => evaluate(request.code)).then(
      (value) => {
        reply({ text: inspect(value) });
        const bytes = sqlite.exportDatabase("browser.db");
        if (bytes) post({ type: "db", bytes }, [bytes.buffer]);
      },
      (e: unknown) => reply({ error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
    );
  } else if (request.type === "host:generate") {
    serially(() => generate(vfs, Trails as Parameters<typeof generate>[1], request.args)).then(
      (written) => reply({ files: written }),
      (e: unknown) => reply({ error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
    );
  } else if (request.type === "host:tables") {
    reply({ tables: sqlite.tables("browser.db") });
  } else if (request.type === "host:rows") {
    reply({ rows: sqlite.rows("browser.db", request.table, 100) });
  }
});

function inspect(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return describe(value);
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object" && value !== null && "attributes" in value) {
    const attributes: unknown = value.attributes;
    if (typeof attributes === "object" && attributes !== null) {
      const pairs = Object.entries(attributes).map(([k, v]) => `${k}: ${inspect(v)}`);
      return `#<${value.constructor.name} ${pairs.join(", ")}>`;
    }
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Runs a console line in the booted app, as `trails console` would: every
 * class under `app/models` is in scope, with `Trails` and `Base`. The line is
 * an expression when it parses as one, and a function body otherwise.
 */
async function evaluate(code: string): Promise<unknown> {
  if (!app) throw new Error("the application is not running");
  const scope: Record<string, unknown> = { Trails, Base };
  for (const path of Object.keys(vfs.files()).filter((p) => /^\/app\/models\/.*\.ts$/.test(p))) {
    Object.assign(scope, await import(/* @vite-ignore */ `${moduleBase}${path.slice(1)}`));
  }
  const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const run = new Function(...names, `return ${consoleLine(code)}`) as (
    ...values: unknown[]
  ) => Promise<unknown>;
  return run(...names.map((n) => scope[n]));
}

let Trails: unknown = null;
let Base: unknown = null;

try {
  const problems = Object.entries(vfs.files()).flatMap(([path, source]) =>
    path.endsWith(".ts") && typeof source === "string" ? syntaxErrors(source, path) : [],
  );
  post({ type: "problems", problems });
  if (problems.length) {
    const lines = problems.map((p) => `${p.path}:${p.line}:${p.column} ${p.message}`);
    throw new SyntaxError(`the app has syntax errors\n  ${lines.join("\n  ")}`);
  }
  status("Booting the application…");
  const trailties =
    (await import("@blazetrails/trailties")) as typeof import("@blazetrails/trailties");
  Trails = trailties.Trails;
  await import(/* @vite-ignore */ `${moduleBase}config/environment.ts`);
  status("Running migrations…");
  const activerecord = await import("@blazetrails/activerecord");
  const { DatabaseTasks } = await import("@blazetrails/activerecord/tasks/database-tasks.js");
  Base = activerecord.Base;
  const pool = activerecord.Base.connectionPool();
  await pool.migrationContext.migrate();
  pool.schemaReflection.clearBang();
  await pool.schemaReflection.loadAllBang(pool);
  if (files.db === null) {
    status("Seeding the database…");
    await DatabaseTasks.loadSeed();
    const bytes = sqlite.exportDatabase("browser.db");
    if (bytes) post({ type: "db", bytes }, [bytes.buffer]);
  }
  app = trailties.Trails.application;
  status("Running");
  post({ type: "booted" });
} catch (e) {
  bootError = e;
  console.error("Boot failed:", e);
  status("Boot failed");
  post({ type: "boot-failed", text: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
}
