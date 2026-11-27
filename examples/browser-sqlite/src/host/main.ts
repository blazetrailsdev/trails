import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/fira-code";
import { goToLine, installEditing } from "./editing.ts";
import { installFind } from "./find.ts";
import { highlight } from "./highlight.ts";
import { loadDatabase, saveDatabase } from "./storage.ts";
import { applyChanges, changesFrom, decodeChanges, encodeChanges, isFilePath } from "./share.ts";
import { zip } from "./zip.ts";

const TEMPLATES = import.meta.glob<string>("../../templates/*/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
});

const EXAMPLES: Record<string, { title: string; open: string; path: string }> = {
  blog: { title: "Blog", open: "/app/controllers/posts-controller.ts", path: "/" },
  library: { title: "Library API", open: "/app/models/author.ts", path: "/authors" },
};
const EXAMPLE_KEY = "trails-browser:example";
const requested = new URLSearchParams(location.search).get("example");
const example =
  requested && requested in EXAMPLES
    ? requested
    : (sessionStorage.getItem(EXAMPLE_KEY) ?? localStorage.getItem(EXAMPLE_KEY) ?? "blog");
const FILES_KEY = `trails-browser:${example}:files`;
const COOKIES_KEY = `trails-browser:${example}:cookies`;
const TMP_KEY = `trails-browser:${example}:tmp`;
const CURRENT_KEY = `trails-browser:${example}:current`;
const LEGACY_KEYS = ["files", "cookies", "tmp", "current"];
const LEGACY_DB_KEY = "trails-browser:db";
const LAYOUT_KEY = "trails-browser:layout";
const HINT_KEY = "trails-browser:hint-seen";
const SHARE_PREFIX = "#code=";
const LONG_LINE = 600;
const MAX_LINES = 3000;

type Problem = {
  path: string;
  line: number;
  column: number;
  message: string;
  severity?: "warning";
};
type Table = { name: string; count: number };
type Rows = { columns: string[]; values: unknown[][] };

function templateFiles(): Record<string, string> {
  const prefix = `../../templates/${example}/`;
  return Object.fromEntries(
    Object.entries(TEMPLATES)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, source]) => [`/${key.slice(prefix.length)}`, source]),
  );
}

/**
 * Moves what the playground kept before it had more than one example (the
 * blog's files under unprefixed keys, its database as base64) to the blog's
 * keys and IndexedDB.
 */
async function migrateLegacyStorage(): Promise<void> {
  for (const name of LEGACY_KEYS) {
    const value = localStorage.getItem(`trails-browser:${name}`);
    if (value === null) continue;
    localStorage.setItem(`trails-browser:blog:${name}`, value);
    localStorage.removeItem(`trails-browser:${name}`);
  }
  const text = localStorage.getItem(LEGACY_DB_KEY);
  if (text === null) return;
  try {
    await saveDatabase(
      "blog",
      Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
    );
  } catch {
    log("warn", "The database saved by an older playground could not be read; it was discarded.");
  }
  localStorage.removeItem(LEGACY_DB_KEY);
}

/** False when another tab holds this example, so this tab's edits are not saved over that one's. */
let owner = true;
let storageFull = false;
function store(key: string, value: string | null): void {
  if (!owner) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    if (storageFull) return;
    storageFull = true;
    log("warn", "This page's browser storage is full: changes from here on are not kept.");
  }
}

function stored<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

const tabId = crypto.randomUUID().slice(0, 8);
let files: Record<string, string> = templateFiles();
let db: Uint8Array | null = null;
let tmp: Record<string, string> = {};
let cookies: Record<string, string> = {};
let current = EXAMPLES[example].open;
let session = 0;
let runtime: HTMLIFrameElement | null = null;
let problems: Problem[] = [];
let typeWarnings: Problem[] = [];
let checker: Worker | null = null;
let checkTimer: ReturnType<typeof setTimeout> | undefined;

const allProblems = (): Problem[] => [...typeWarnings, ...problems];

function checkTypes(): void {
  if (!checker) {
    checker = new Worker(new URL("./type-check.worker.ts", import.meta.url), { type: "module" });
    checker.onmessage = (event: MessageEvent<Problem[]>) => {
      typeWarnings = event.data;
      renderProblems();
    };
    checker.onerror = (e) => log("warn", `The type checker stopped: ${e.message}`);
  }
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => checker!.postMessage(files), 300);
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tree = $<HTMLElement>("tree");
const editor = $<HTMLTextAreaElement>("editor");
const backdrop = $("highlight");
const gutter = $("gutter");
const preview = $<HTMLIFrameElement>("preview");
const consoleEl = $<HTMLElement>("console");
const urlInput = $<HTMLInputElement>("url");
const statusEl = $<HTMLElement>("status");
const filter = $<HTMLSelectElement>("filter");
const overlay = $("overlay");

let painted = 0;
let paintQueued = false;
function paint(): void {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const run = ++painted;
    const source = editor.value;
    highlight(source.endsWith("\n") ? `${source} ` : source, current).then(
      (html) => {
        if (run !== painted) return;
        backdrop.innerHTML = html;
        editor.classList.add("highlighted");
        syncScroll();
      },
      (e: unknown) => {
        if (run !== painted) return;
        backdrop.replaceChildren();
        editor.classList.remove("highlighted");
        console.error("highlighting failed:", e);
      },
    );
  });
}
function syncScroll(): void {
  backdrop.scrollTop = editor.scrollTop;
  backdrop.scrollLeft = editor.scrollLeft;
  gutter.scrollTop = editor.scrollTop;
}
editor.addEventListener("scroll", syncScroll);

function renderGutter(): void {
  const marked = new Map(
    allProblems()
      .filter((p) => p.path === current)
      .map((p) => [p.line, p]),
  );
  const count = editor.value.split("\n").length;
  if (gutter.childElementCount !== count) {
    gutter.replaceChildren(
      ...Array.from({ length: count }, (_, i) => {
        const line = document.createElement("div");
        line.textContent = String(i + 1);
        return line;
      }),
    );
  }
  for (const [i, line] of [...gutter.children].entries()) {
    const problem = marked.get(i + 1);
    line.classList.toggle("problem", problem !== undefined && !problem.severity);
    line.classList.toggle("warning", problem?.severity === "warning");
    (line as HTMLElement).title = problem?.message ?? "";
  }
}

function renderProblems(): void {
  const list = $("problems");
  const mine = allProblems().filter((p) => p.path === current);
  list.hidden = mine.length === 0;
  list.replaceChildren(
    ...mine.map((p) => {
      const item = document.createElement("li");
      const jump = document.createElement("button");
      jump.textContent = `Line ${p.line}: ${p.message}`;
      jump.classList.toggle("warning", p.severity === "warning");
      jump.onclick = () => goToLine(editor, p.line);
      item.append(jump);
      return item;
    }),
  );
  renderGutter();
}

let dbWrites: Promise<void> = Promise.resolve();
function saveDb(bytes: Uint8Array | null): void {
  db = bytes;
  if (!owner) return;
  dbWrites = dbWrites
    .then(() => saveDatabase(example, bytes))
    .catch((e: unknown) => log("warn", `The database could not be saved: ${String(e)}`));
}

function appendAnsi(parent: HTMLElement, text: string): void {
  let color: string | null = null;
  let bold = false;

  // eslint-disable-next-line no-control-regex -- ESC opens an SGR sequence
  for (const [i, part] of text.split(/\x1b\[([\d;]*)m/).entries()) {
    if (i % 2 === 1) {
      for (const code of part.split(";").map(Number)) {
        if (code === 0) [color, bold] = [null, false];
        else if (code === 1) bold = true;
        else if (code >= 30 && code <= 37) color = `var(--ansi-${code - 30})`;
      }
      continue;
    }
    if (!part) continue;
    const span = document.createElement("span");
    span.textContent = part;
    if (color) span.style.color = color;
    if (bold) span.style.fontWeight = "bold";
    parent.append(span);
  }
}

const FRAMEWORK_TRACE = "\n\u0000framework\n";
const SQL = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE (TABLE|INDEX)|TRANSACTION)\b/;
const ALWAYS = new Set(["system", "input", "result"]);

function shown(level: string, text: string): boolean {
  if (ALWAYS.has(level)) return true;
  switch (filter.value) {
    case "requests":
      return level === "request";
    case "sql":
      return SQL.test(text);
    case "problems":
      return level === "warn" || level === "error";
    default:
      return true;
  }
}

function log(level: string, text: string): void {
  const stick = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
  const line = document.createElement("div");
  line.className = level;
  line.dataset.level = level;
  line.dataset.text = text;
  const [own, framework] = text.split(FRAMEWORK_TRACE);
  if (framework !== undefined) {
    appendAnsi(line, own);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const frames = framework.split("\n").filter(Boolean);
    summary.textContent = `Framework Trace (${frames.length} frames)`;
    details.append(summary, frames.join("\n"));
    line.append(details);
  } else if (text.length > LONG_LINE) {
    appendAnsi(line, text.slice(0, LONG_LINE));
    const more = document.createElement("button");
    more.className = "more";
    more.textContent = `… ${text.length - LONG_LINE} more characters`;
    more.onclick = () => {
      line.replaceChildren();
      appendAnsi(line, text);
    };
    line.append(more);
  } else {
    appendAnsi(line, text);
  }
  line.hidden = !shown(level, text);
  consoleEl.append(line);
  while (consoleEl.childElementCount > MAX_LINES) consoleEl.firstElementChild!.remove();
  if (stick) consoleEl.scrollTop = consoleEl.scrollHeight;
}

filter.addEventListener("change", () => {
  for (const line of consoleEl.children as HTMLCollectionOf<HTMLElement>) {
    line.hidden = !shown(line.dataset.level!, line.dataset.text!);
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;
});

function setStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.dataset.state =
    text === "Running" ? "ok" : /failed|could not/i.test(text) ? "error" : "busy";
}

function renderTree(): void {
  tree.replaceChildren();
  const broken = new Set(problems.map((p) => p.path));
  let lastDirs: string[] = [];
  for (const path of Object.keys(files).sort()) {
    const parts = path.slice(1).split("/");
    const dirs = parts.slice(0, -1);
    dirs.forEach((dir, i) => {
      if (lastDirs[i] === dir && dirs.slice(0, i).join("/") === lastDirs.slice(0, i).join("/"))
        return;
      const el = document.createElement("div");
      el.className = "dir";
      el.style.paddingLeft = `${0.75 + i}rem`;
      el.textContent = `${dir}/`;
      tree.append(el);
    });
    lastDirs = dirs;
    const el = document.createElement("button");
    el.className = "file";
    el.classList.toggle("active", path === current);
    el.classList.toggle("broken", broken.has(path));
    el.setAttribute("role", "treeitem");
    el.setAttribute("aria-selected", String(path === current));
    el.style.paddingLeft = `${0.75 + dirs.length}rem`;
    el.textContent = parts.at(-1)!;
    el.title = path;
    el.onclick = () => open(path);
    tree.append(el);
  }
}

tree.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = [...tree.querySelectorAll<HTMLElement>(".file")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = items[at + (e.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  e.preventDefault();
  next.focus();
});

function open(path: string): void {
  current = path;
  store(CURRENT_KEY, path);
  editor.value = files[path] ?? "";
  $("editor-path").textContent = path;
  renderTree();
  renderProblems();
  paint();
}

function saveFiles(): void {
  store(FILES_KEY, JSON.stringify(files));
  if (checker) checkTypes();
}

const hinted = new Set<string>();
let restartTimer: ReturnType<typeof setTimeout> | undefined;
editor.addEventListener("input", () => {
  paint();
  renderGutter();
  files[current] = editor.value;
  saveFiles();
  clearTimeout(restartTimer);
  if (current.startsWith("/db/migrate/")) {
    if (hinted.has(current)) return;
    hinted.add(current);
    log(
      "system",
      "Edits to a migration wait for Restart (Ctrl+S), so a half-written one never runs. One that already ran needs Reset database to run again.",
    );
    return;
  }
  if ($<HTMLInputElement>("autorun").checked) restartTimer = setTimeout(restart, 800);
});
installFind(editor, $("find"));
installEditing(editor, () => {
  clearTimeout(restartTimer);
  restart();
});

function className(path: string): string {
  const base = path.split("/").at(-1)!.replace(/\.ts$/, "").replace(/^\d+_/, "");
  return base
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function starter(path: string): string {
  const name = className(path);
  if (path.startsWith("/app/models/")) {
    return `import { ApplicationRecord } from "./application-record.ts";\n\nexport class ${name} extends ApplicationRecord {}\n`;
  }
  if (path.startsWith("/app/controllers/")) {
    return `import { ApplicationController } from "./application-controller.ts";\n\nexport class ${name} extends ApplicationController {\n  async index(): Promise<void> {}\n}\n`;
  }
  if (path.startsWith("/db/migrate/")) {
    return `import { Migration } from "@blazetrails/activerecord";\n\nexport class ${name} extends Migration.get(8.0) {\n  async change(): Promise<void> {}\n}\n`;
  }
  return "";
}

function askPath(message: string, suggestion: string): string | null {
  const answer = prompt(message, suggestion)?.trim();
  if (!answer) return null;
  const path = answer.startsWith("/") ? answer : `/${answer}`;
  if (!isFilePath(path)) {
    alert("That is not a file path.");
    return null;
  }
  if (path in files) {
    alert(`${path} already exists.`);
    return null;
  }
  return path;
}

$("new-file").onclick = () => {
  const dir = current.slice(0, current.lastIndexOf("/") + 1);
  const version = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const path = askPath(
    "Path of the new file",
    dir === "/db/migrate/" ? `${dir}${version}_create_things.ts` : dir,
  );
  if (!path) return;
  files[path] = starter(path);
  saveFiles();
  open(path);
  editor.focus();
  if (!path.startsWith("/db/migrate/")) restart();
};
$("generate").onclick = async () => {
  const line = prompt(
    "bin/trails generate (model, migration, scaffold, controller…)",
    "model Tag name:string",
  )?.trim();
  if (!line) return;
  log("input", `$ bin/trails generate ${line}`);
  try {
    const { files: written } = await ask<{ files: Record<string, string | null> }>(
      "host:generate",
      {
        args: line.split(/\s+/),
      },
    );
    const paths = Object.keys(written).sort();
    if (!paths.length) return log("system", "The generator wrote no files.");
    for (const path of paths) {
      if (written[path] === null) delete files[path];
      else files[path] = written[path];
    }
    saveFiles();
    const added = paths.filter((p) => written[p] !== null);
    open(
      added.find((p) => p.startsWith("/app/")) ??
        added[0] ??
        (current in files ? current : Object.keys(files).sort()[0]),
    );
    restart();
  } catch (error) {
    log("error", error instanceof Error ? error.message : String(error));
  }
};
$("rename-file").onclick = () => {
  const path = askPath(`New path for ${current}`, current);
  if (!path) return;
  files[path] = files[current];
  delete files[current];
  saveFiles();
  open(path);
  restart();
};
$("delete-file").onclick = () => {
  if (Object.keys(files).length === 1) {
    alert("This is the app's only file. Reset files brings the example back.");
    return;
  }
  if (!confirm(`Delete ${current}?`)) return;
  delete files[current];
  saveFiles();
  open(Object.keys(files).sort()[0]);
  restart();
};

const previewPath = `${import.meta.env.BASE_URL}preview/${tabId}`;

function navigate(path: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    log("system", `The preview serves this app only. Opening ${path} in a new tab.`);
    window.open(path, "_blank", "noopener");
    urlInput.value = previewLocation() ?? "/";
    return;
  }
  const target = path.startsWith("/") ? path : `/${path}`;
  preview.src = `${previewPath}${target}`;
}

function previewLocation(): string | null {
  try {
    const loc = preview.contentWindow!.location;
    if (loc.pathname === previewPath || loc.pathname.startsWith(`${previewPath}/`))
      return loc.pathname.slice(previewPath.length) + loc.search || "/";
  } catch {
    /* cross-origin */
  }
  return null;
}

const LAYOUT_VIEWPORT = 980;

/**
 * Lays out a page with no `<meta name="viewport">` the way a phone browser
 * does: 980 CSS pixels wide, scaled down to fit. An iframe has no layout
 * viewport of its own, so such a page would otherwise be laid out at the
 * pane's width.
 */
function fitPreview(): void {
  let declared = true;
  try {
    declared = preview.contentDocument?.querySelector('meta[name="viewport"]') != null;
  } catch {
    /* cross-origin */
  }
  const wrap = preview.parentElement!;
  const scale = wrap.clientWidth / LAYOUT_VIEWPORT;
  if (declared || scale >= 1) {
    preview.style.removeProperty("width");
    preview.style.removeProperty("height");
    preview.style.removeProperty("transform");
    return;
  }
  preview.style.width = `${LAYOUT_VIEWPORT}px`;
  preview.style.height = `${wrap.clientHeight / scale}px`;
  preview.style.transform = `scale(${scale})`;
}
new ResizeObserver(fitPreview).observe(preview.parentElement!);

preview.addEventListener("load", () => {
  fitPreview();
  const path = previewLocation();
  if (path) urlInput.value = path;
  if (!$("database").hidden) showDatabase();
});
$<HTMLFormElement>("address").addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(urlInput.value);
});
$("reload").onclick = () => preview.contentWindow?.location.reload();
$("back").onclick = () => preview.contentWindow?.history.back();
$("forward").onclick = () => preview.contentWindow?.history.forward();
$("routes").onclick = () => navigate("/trails/info/routes");
$("popout").onclick = () => window.open(`${previewPath}${previewLocation() ?? "/"}`, "_blank");
$("clear").onclick = () => consoleEl.replaceChildren();
$("run").onclick = () => restart();
$("reset-db").onclick = () => {
  if (!confirm("Delete the database and seed it again? Every post and comment you made is lost."))
    return;
  saveDb(null);
  cookies = {};
  store(COOKIES_KEY, null);
  hinted.clear();
  restart();
};
$("reset-files").onclick = () => {
  if (!confirm("Replace every file with the example app's original?")) return;
  files = templateFiles();
  store(FILES_KEY, null);
  open(current in files ? current : Object.keys(files)[0]);
  restart();
};

$("share").onclick = async () => {
  const code = await encodeChanges(changesFrom(templateFiles(), files));
  const link = `${location.origin}${location.pathname}${SHARE_PREFIX}${code}`;
  try {
    await navigator.clipboard.writeText(link);
    log("system", `Copied a link to these files (${link.length} characters).`);
  } catch {
    log("system", `A link to these files:\n${link}`);
  }
};
$("download").onclick = () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(zip(files, "trails-playground"));
  link.download = "trails-playground.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

let asked = 0;
const answers = new Map<number, (data: Record<string, unknown>) => void>();
function ask<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!runtime?.contentWindow) return reject(new Error("the app is not running"));
    const id = ++asked;
    answers.set(id, (data) => {
      if (typeof data.error === "string") reject(new Error(data.error));
      else resolve(data as T);
    });
    runtime.contentWindow.postMessage({ type, id, ...extra }, location.origin);
  });
}

const history: string[] = [];
let recalled = 0;
const replInput = $<HTMLInputElement>("repl-input");
$<HTMLFormElement>("repl").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = replInput.value.trim();
  if (!code) return;
  history.push(code);
  recalled = history.length;
  replInput.value = "";
  log("input", `› ${code}`);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  try {
    log("result", (await ask<{ text: string }>("host:eval", { code })).text);
  } catch (error) {
    log("error", error instanceof Error ? error.message : String(error));
  }
  if (!$("database").hidden) showDatabase();
});
replInput.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  recalled = Math.max(0, Math.min(history.length, recalled + (e.key === "ArrowUp" ? -1 : 1)));
  replInput.value = history[recalled] ?? "";
});

const INTERNAL_TABLES = new Set(["ar_internal_metadata", "schema_migrations"]);
let table: string | null = null;
function showDatabase(): void {
  refreshDatabase().catch((e: unknown) => log("error", `The database tab failed: ${String(e)}`));
}

async function refreshDatabase(): Promise<void> {
  const view = $("database");
  let tables: Table[];
  try {
    ({ tables } = await ask<{ tables: Table[] }>("host:tables"));
  } catch {
    view.textContent = "The app is not running.";
    return;
  }
  if (!tables.some((t) => t.name === table)) {
    const own = tables.find((t) => !INTERNAL_TABLES.has(t.name)) ?? tables[0];
    table = own?.name ?? null;
  }
  const list = document.createElement("div");
  list.className = "tables";
  for (const t of tables) {
    const pick = document.createElement("button");
    pick.textContent = `${t.name} (${t.count})`;
    pick.setAttribute("aria-pressed", String(t.name === table));
    pick.onclick = () => {
      table = t.name;
      showDatabase();
    };
    list.append(pick);
  }
  const grid = document.createElement("table");
  if (table) {
    const { rows } = await ask<{ rows: Rows }>("host:rows", { table });
    const head = grid.createTHead().insertRow();
    for (const column of rows.columns) {
      const cell = document.createElement("th");
      cell.textContent = column;
      head.append(cell);
    }
    const body = grid.createTBody();
    for (const values of rows.values) {
      const row = body.insertRow();
      for (const value of values) {
        const cell = row.insertCell();
        const text = value === null ? "NULL" : String(value);
        cell.textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        cell.title = text;
        cell.classList.toggle("null", value === null);
      }
    }
  }
  view.replaceChildren(list, grid);
}

function showTab(name: "console" | "database"): void {
  $("console-view").hidden = name !== "console";
  $("database").hidden = name !== "database";
  $("tab-console").setAttribute("aria-selected", String(name === "console"));
  $("tab-database").setAttribute("aria-selected", String(name === "database"));
  filter.hidden = $("clear").hidden = name !== "console";
  if (name === "database") showDatabase();
}
$("tab-console").onclick = () => showTab("console");
$("tab-database").onclick = () => showTab("database");

const main = document.querySelector("main")!;
const layout: Record<string, number> = stored(LAYOUT_KEY, {});
function applyLayout(): void {
  for (const [name, px] of Object.entries(layout)) main.style.setProperty(`--${name}`, `${px}px`);
}
applyLayout();
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function resized(name: string, x: number, y: number): number {
  const box = main.getBoundingClientRect();
  if (name === "tree") return clamp(x - box.left, 120, 420);
  if (name === "right") return clamp(box.right - x, 260, box.width - 360);
  return clamp(box.bottom - y, 90, box.height - 140);
}
for (const handle of document.querySelectorAll<HTMLElement>(".resizer")) {
  const name = handle.dataset.resize!;
  handle.tabIndex = 0;
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (m: PointerEvent) => {
      layout[name] = resized(name, m.clientX, m.clientY);
      applyLayout();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener(
      "pointerup",
      () => {
        handle.removeEventListener("pointermove", move);
        document.body.classList.remove("resizing");
        store(LAYOUT_KEY, JSON.stringify(layout));
      },
      { once: true },
    );
  });
  handle.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -16, ArrowUp: -16, ArrowRight: 16, ArrowDown: 16 }[e.key];
    if (!step) return;
    e.preventDefault();
    const box = handle.getBoundingClientRect();
    layout[name] = resized(name, box.left + step, box.top + step);
    applyLayout();
    store(LAYOUT_KEY, JSON.stringify(layout));
  });
}

if (!localStorage.getItem(HINT_KEY)) $("hint").hidden = false;
$("hint-close").onclick = () => {
  $("hint").hidden = true;
  store(HINT_KEY, "1");
};

addEventListener("message", (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== runtime?.contentWindow) return;
  const data = event.data as {
    type: string;
    id?: number;
    level?: string;
    text?: string;
    bytes?: Uint8Array;
    cookies?: Record<string, string>;
    path?: string;
    problems?: Problem[];
  };
  switch (data.type) {
    case "runtime:waiting":
      runtime.contentWindow!.postMessage(
        { type: "host:files", files: { ...tmp, ...files }, db, cookies },
        location.origin,
      );
      break;
    case "console":
      log(data.level!, data.text!);
      break;
    case "request":
      log("request", data.text!);
      break;
    case "status":
      setStatus(data.text!);
      break;
    case "db":
      saveDb(data.bytes!);
      break;
    case "tmp":
      tmp = { ...tmp, [data.path!]: data.text! };
      store(TMP_KEY, JSON.stringify(tmp));
      break;
    case "cookies":
      cookies = data.cookies!;
      store(COOKIES_KEY, JSON.stringify(cookies));
      break;
    case "problems":
      problems = data.problems!;
      renderTree();
      renderProblems();
      break;
    case "reply":
      answers.get(data.id!)?.(data);
      answers.delete(data.id!);
      break;
    case "boot-failed":
      $("overlay-text").textContent = data.text ?? "";
      overlay.hidden = false;
      break;
    case "booted":
      overlay.hidden = true;
      if (!checker) checkTypes();
      navigate(previewLocation() ?? (urlInput.value || "/"));
      break;
  }
});

function restart(): void {
  session += 1;
  log("system", `— starting trails (run ${session}) —`);
  setStatus("Starting…");
  for (const [, fail] of answers) fail({ error: "the app restarted" });
  answers.clear();
  runtime?.remove();
  runtime = document.createElement("iframe");
  runtime.src = `${import.meta.env.BASE_URL}runtime.html?tab=${tabId}&session=${session}`;
  $("runtime-holder").append(runtime);
}

async function loadShared(): Promise<void> {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const code = location.hash.slice(SHARE_PREFIX.length);
  window.history.replaceState(null, "", location.pathname + location.search);
  try {
    const changes = await decodeChanges(code);
    const count = Object.keys(changes).length;
    const ok = confirm(
      `Load the shared app from this link (${count} changed file${count === 1 ? "" : "s"})? It replaces the files you have here, and its code runs in this tab.`,
    );
    if (!ok) return;
    files = applyChanges(templateFiles(), changes);
    saveFiles();
    saveDb(null);
  } catch {
    log("warn", "The link's shared files could not be read; showing your own files.");
  }
}

/**
 * Takes this example's Web Lock for as long as the tab is open, so a second
 * tab on the same example finds it held. Answers whether this tab got it.
 */
function holdExample(): Promise<boolean> {
  if (!("locks" in navigator)) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request(`trails-browser:${example}`, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        return lock === null ? undefined : new Promise<never>(() => {});
      })
      .catch(() => resolve(true));
  });
}

const picker = $<HTMLSelectElement>("example");
for (const [name, { title }] of Object.entries(EXAMPLES)) picker.add(new Option(title, name));
picker.value = example;
picker.onchange = () => {
  sessionStorage.setItem(EXAMPLE_KEY, picker.value);
  localStorage.setItem(EXAMPLE_KEY, picker.value);
  location.search = "";
};

async function start(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "this browser has no service workers here (a private window, perhaps), and the playground needs one to serve the app",
    );
  }
  const ready = await Promise.race([
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(() => navigator.serviceWorker.ready)
      .then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (!ready) {
    throw new Error(
      "the playground's service worker did not install; close this tab and open the playground in a new one",
    );
  }
  if (!navigator.serviceWorker.controller) {
    const claimed = await new Promise<boolean>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(true), {
        once: true,
      });
      setTimeout(() => resolve(false), 2000);
    });
    if (!claimed) {
      location.reload();
      return;
    }
  }
  owner = await holdExample();
  if (owner && example === "blog") await migrateLegacyStorage();
  if (!owner) {
    log(
      "warn",
      `The ${EXAMPLES[example].title} example is open in another tab. This tab runs its own copy, and nothing you change here is saved.`,
    );
  }
  files = stored(FILES_KEY, templateFiles());
  tmp = stored(TMP_KEY, {});
  cookies = stored(COOKIES_KEY, {});
  current = localStorage.getItem(CURRENT_KEY) ?? current;
  db = await loadDatabase(example);
  if (!localStorage.getItem(FILES_KEY)) urlInput.value = EXAMPLES[example].path;
  await loadShared();
  open(current in files ? current : Object.keys(files).sort()[0]);
  restart();
}

start().catch((e: unknown) => {
  setStatus("Could not start");
  $("overlay-text").textContent = e instanceof Error ? e.message : String(e);
  overlay.hidden = false;
  log("error", String(e));
});
