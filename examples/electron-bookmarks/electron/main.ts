import { app, BrowserWindow, dialog, Menu, nativeImage, Notification, shell, Tray } from "electron";
import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from "electron";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
process.chdir(root);
process.env.TRAILS_ENV ??= app.isPackaged ? "production" : "development";
if (process.env.TRAILS_ENV === "production") {
  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  process.env.BOOKMARKS_DATABASE ??= join(userData, "bookmarks.sqlite3");
  const secretPath = join(userData, "secret_key_base");
  if (!existsSync(secretPath))
    writeFileSync(secretPath, randomBytes(64).toString("hex"), { mode: 0o600 });
  process.env.SECRET_KEY_BASE ??= readFileSync(secretPath, "utf8").trim();
}

if (!app.requestSingleInstanceLock()) app.exit(0);

await app.whenReady();

const { Trails } = await import("@blazetrails/trailties");
await import("../config/environment.ts");
const { DatabaseTasks } = await import("@blazetrails/activerecord");
await DatabaseTasks.prepareAll();

const { Desktop } = await import("../app/models/desktop.ts");
const { Bookmark } = await import("../app/models/bookmark.ts");
const { Handler } = await import("@blazetrails/rackup");
const Node = (await Handler.get("node")) as typeof Handler.Node;

const server = await Node.run(Trails.application as never, { Host: "127.0.0.1", Port: 0 });
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let win: BrowserWindow | null = null;

/** Electron callbacks can't await; their failures are logged here. */
function parentWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const parent = parentWindow();
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const parent = parentWindow();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

function report(promise: Promise<unknown>): void {
  promise.catch((error: unknown) => console.error(error));
}

function openWindow(path = "/"): BrowserWindow {
  if (win && !win.isDestroyed()) {
    if (path !== "/") report(visit(path));
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 480,
    title: "Reading List",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    report(shell.openExternal(url));
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      report(shell.openExternal(url));
    }
  });
  report(win.loadURL(origin + path));
  return win;
}

/** Navigates the open window with Turbo, so the page is not reloaded. */
async function visit(path: string): Promise<void> {
  await win?.webContents.executeJavaScript(`Turbo.visit(${JSON.stringify(path)})`);
}

/** Submits one of the toolbar's button forms (Import…, Export…), CSRF token included. */
async function submit(action: string): Promise<void> {
  const w = openWindow();
  if (w.webContents.isLoading())
    await new Promise<void>((resolve) => w.webContents.once("did-finish-load", () => resolve()));
  await w.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(`form[action="${action}"]`)})?.requestSubmit()`,
  );
}

Desktop.shell = {
  async pickFiles() {
    const result = await showOpenDialog({
      title: "Attach files",
      properties: ["openFile", "multiSelections"],
    });
    return result.canceled ? [] : result.filePaths;
  },
  async pickImportFile() {
    const result = await showOpenDialog({
      title: "Import bookmarks",
      properties: ["openFile"],
      filters: [{ name: "Bookmark exports", extensions: ["json", "csv"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  },
  async pickExportPath(defaultName) {
    const result = await showSaveDialog({
      title: "Export bookmarks",
      defaultPath: join(app.getPath("documents"), defaultName),
      filters: [
        { name: "JSON", extensions: ["json"] },
        { name: "CSV", extensions: ["csv"] },
      ],
    });
    return result.canceled ? null : (result.filePath ?? null);
  },
  async openPath(path) {
    const error = await shell.openPath(path);
    if (error !== "") throw new Error(error);
  },
  notify(title, body) {
    new Notification({ title, body }).show();
  },
};

const isMac = process.platform === "darwin";
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Bookmark",
          accelerator: "CmdOrCtrl+N",
          click: () => report(visit("/bookmarks/new")),
        },
        { type: "separator" },
        { label: "Import…", accelerator: "CmdOrCtrl+O", click: () => report(submit("/import")) },
        { label: "Export…", accelerator: "CmdOrCtrl+E", click: () => report(submit("/export")) },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "All Bookmarks",
          accelerator: "CmdOrCtrl+1",
          click: () => report(visit("/bookmarks")),
        },
        {
          label: "Unread",
          accelerator: "CmdOrCtrl+2",
          click: () => report(visit("/bookmarks?filter=unread")),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]),
);

const tray = new Tray(
  nativeImage
    .createFromPath(join(root, "electron/trayTemplate.png"))
    .resize({ width: 16, height: 16 }),
);
tray.setToolTip("Reading List");
tray.on("click", () => openWindow());

async function refreshTray(): Promise<void> {
  const unread = await Bookmark.unread().count();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `${unread} unread`, enabled: false },
      { label: "Show Reading List", click: () => openWindow() },
      { label: "New Bookmark", click: () => openWindow("/bookmarks/new") },
      { type: "separator" },
      { role: "quit" },
    ]),
  );
  if (isMac) app.dock?.setBadge(unread > 0 ? String(unread) : "");
}

/** Notifies once for each unread bookmark whose reminder time has passed. */
async function sendReminders(): Promise<void> {
  const due = (await Bookmark.dueForReminder().toArray()) as InstanceType<typeof Bookmark>[];
  for (const bookmark of due) {
    const notification = new Notification({ title: "Time to read", body: bookmark.title });
    notification.on("click", () => openWindow(`/bookmarks/${bookmark.id}`));
    notification.show();
    await bookmark.updateColumn("reminded_at", new Date());
  }
}

async function tick(): Promise<void> {
  try {
    await sendReminders();
    await refreshTray();
  } catch (error) {
    console.error(error);
  }
}

await tick();
setInterval(() => report(tick()), 30_000);
app.on("browser-window-focus", () => report(tick()));

openWindow();

app.on("second-instance", () => openWindow());
app.on("activate", () => openWindow());
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  server.close();
});
