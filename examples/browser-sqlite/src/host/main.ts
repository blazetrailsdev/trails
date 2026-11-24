import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/fira-code";
import { latin1 } from "../runtime/latin1.ts";
import { highlight } from "./highlight.ts";

const TEMPLATE = import.meta.glob<string>("../../template/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
});

const FILES_KEY = "trails-browser:files";
const DB_KEY = "trails-browser:db";
const COOKIES_KEY = "trails-browser:cookies";
const TMP_KEY = "trails-browser:tmp";

function templateFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(TEMPLATE).map(([key, source]) => [
      key.replace(/^\.\.\/\.\.\/template/, ""),
      source,
    ]),
  );
}

let files: Record<string, string> =
  JSON.parse(localStorage.getItem(FILES_KEY) ?? "null") ?? templateFiles();
let db: Uint8Array | null = loadDb();
let tmp: Record<string, string> = JSON.parse(localStorage.getItem(TMP_KEY) ?? "{}");
let cookies: Record<string, string> = JSON.parse(localStorage.getItem(COOKIES_KEY) ?? "{}");
let current = "/app/controllers/posts-controller.ts";
let session = 0;
let runtime: HTMLIFrameElement | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tree = $<HTMLElement>("tree");
const editor = $<HTMLTextAreaElement>("editor");
const backdrop = $("highlight");

let painted = 0;
function paint(): void {
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
}
function syncScroll(): void {
  backdrop.scrollTop = editor.scrollTop;
  backdrop.scrollLeft = editor.scrollLeft;
}
editor.addEventListener("scroll", syncScroll);
const preview = $<HTMLIFrameElement>("preview");
const consoleEl = $<HTMLPreElement>("console");
const urlInput = $<HTMLInputElement>("url");
const statusEl = $<HTMLElement>("status");

function loadDb(): Uint8Array | null {
  const stored = localStorage.getItem(DB_KEY);
  if (!stored) return null;
  return Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
}

function saveDb(bytes: Uint8Array | null): void {
  db = bytes;
  if (!bytes) return localStorage.removeItem(DB_KEY);
  localStorage.setItem(DB_KEY, btoa(latin1(bytes)));
}

const ANSI_COLORS = ["#666", "#f77", "#7d7", "#fd6", "#79f", "#d8f", "#7df", "#ddd"];

function appendAnsi(parent: HTMLElement, text: string): void {
  let color: string | null = null;
  let bold = false;

  // eslint-disable-next-line no-control-regex -- ESC opens an SGR sequence
  for (const [i, part] of text.split(/\x1b\[([\d;]*)m/).entries()) {
    if (i % 2 === 1) {
      for (const code of part.split(";").map(Number)) {
        if (code === 0) [color, bold] = [null, false];
        else if (code === 1) bold = true;
        else if (code >= 30 && code <= 37) color = ANSI_COLORS[code - 30];
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

function log(level: string, text: string): void {
  const line = document.createElement("div");
  line.className = level;
  appendAnsi(line, text);
  consoleEl.append(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function renderTree(): void {
  tree.replaceChildren();
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
    const el = document.createElement("div");
    el.className = `file${path === current ? " active" : ""}`;
    el.style.paddingLeft = `${0.75 + dirs.length}rem`;
    el.textContent = parts.at(-1)!;
    el.onclick = () => open(path);
    tree.append(el);
  }
}

function open(path: string): void {
  current = path;
  editor.value = files[path] ?? "";
  $("editor-title").textContent = path;
  renderTree();
  paint();
}

let restartTimer: ReturnType<typeof setTimeout> | undefined;
editor.addEventListener("input", () => {
  paint();
  files[current] = editor.value;
  localStorage.setItem(FILES_KEY, JSON.stringify(files));
  clearTimeout(restartTimer);
  if ($<HTMLInputElement>("autorun").checked) restartTimer = setTimeout(restart, 800);
});
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    clearTimeout(restartTimer);
    restart();
  }
});

const previewPath = `${import.meta.env.BASE_URL}preview`;

function navigate(path: string): void {
  const target = path.startsWith("/") ? path : `/${path}`;
  preview.src = `${previewPath}${target}`;
}

preview.addEventListener("load", () => {
  try {
    const loc = preview.contentWindow!.location;
    if (loc.pathname === previewPath || loc.pathname.startsWith(`${previewPath}/`))
      urlInput.value = loc.pathname.slice(previewPath.length) + loc.search || "/";
  } catch {
    /* cross-origin */
  }
});
$<HTMLFormElement>("address").addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(urlInput.value);
});
$("reload").onclick = () => preview.contentWindow?.location.reload();
$("back").onclick = () => preview.contentWindow?.history.back();
$("clear").onclick = () => consoleEl.replaceChildren();
$("run").onclick = () => restart();
$("reset-db").onclick = () => {
  saveDb(null);
  cookies = {};
  localStorage.removeItem(COOKIES_KEY);
  restart();
};
$("reset-files").onclick = () => {
  if (!confirm("Replace every file with the example app's original?")) return;
  files = templateFiles();
  localStorage.removeItem(FILES_KEY);
  open(current in files ? current : Object.keys(files)[0]);
  restart();
};

addEventListener("message", (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== runtime?.contentWindow) return;
  const data = event.data as {
    type: string;
    level?: string;
    text?: string;
    bytes?: Uint8Array;
    cookies?: Record<string, string>;
    path?: string;
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
      statusEl.textContent = data.text!;
      break;
    case "db":
      saveDb(data.bytes!);
      break;
    case "tmp":
      tmp = { ...tmp, [data.path!]: data.text! };
      localStorage.setItem(TMP_KEY, JSON.stringify(tmp));
      break;
    case "cookies":
      cookies = data.cookies!;
      localStorage.setItem(COOKIES_KEY, JSON.stringify(cookies));
      break;
    case "booted":
      navigate(urlInput.value || "/");
      break;
  }
});

function restart(): void {
  session += 1;
  log("system", `— starting trails (run ${session}) —`);
  runtime?.remove();
  runtime = document.createElement("iframe");
  runtime.src = `${import.meta.env.BASE_URL}runtime.html?session=${session}`;
  $("runtime-holder").append(runtime);
}

async function start(): Promise<void> {
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  await navigator.serviceWorker.ready;
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
  open(current in files ? current : Object.keys(files)[0]);
  restart();
}

start().catch((e: unknown) => {
  statusEl.textContent = "Could not start";
  log("error", String(e));
});
