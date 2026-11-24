import { app, BrowserWindow, Menu, shell } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
process.chdir(root);
process.env.TRAILS_ENV ??= app.isPackaged ? "production" : "development";
if (process.env.TRAILS_ENV === "production") {
  const userData = app.getPath("userData");
  mkdirSync(join(userData, "files"), { recursive: true });
  process.env.WRITEBOOK_DATABASE ??= join(userData, "bookshelf.sqlite3");
  process.env.WRITEBOOK_STORAGE ??= join(userData, "files");
  const secretPath = join(userData, "secret_key_base");
  if (!existsSync(secretPath))
    writeFileSync(secretPath, randomBytes(64).toString("hex"), { mode: 0o600 });
  process.env.SECRET_KEY_BASE ??= readFileSync(secretPath, "utf8").trim();
}

if (!app.requestSingleInstanceLock()) app.exit(0);

async function boot(): Promise<void> {
  const { Trails } = await import("@blazetrails/trailties");
  await import("../config/environment.ts");
  const { Base, DatabaseTasks } = await import("@blazetrails/activerecord");
  await DatabaseTasks.prepareAll();
  const pool = Base.connectionPool();
  await pool.schemaReflection.loadAllBang(pool);

  const { Handler } = await import("@blazetrails/rackup");
  const Node = (await Handler.get("node")) as typeof Handler.Node;

  const server = await Node.run(Trails.application as never, { Host: "127.0.0.1", Port: 0 });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let win: BrowserWindow | null = null;

  function report(promise: Promise<unknown>): void {
    promise.catch((error: unknown) => console.error(error));
  }

  function openWindow(): BrowserWindow {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      return win;
    }
    win = new BrowserWindow({
      width: 1200,
      height: 860,
      minWidth: 480,
      title: "Bookshelf",
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
    report(win.loadURL(origin));
    return win;
  }

  async function visit(path: string): Promise<void> {
    await openWindow().webContents.executeJavaScript(`Turbo.visit(${JSON.stringify(path)})`);
  }

  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: "appMenu" as const }] : []),
      {
        label: "File",
        submenu: [
          { label: "Library", accelerator: "CmdOrCtrl+L", click: () => report(visit("/")) },
          {
            label: "New Book",
            accelerator: "CmdOrCtrl+N",
            click: () => report(visit("/books/new")),
          },
          { type: "separator" },
          isMac ? { role: "close" } : { role: "quit" },
        ],
      },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" }],
      },
      { role: "windowMenu" },
    ]),
  );

  openWindow();

  app.on("second-instance", () => openWindow());
  app.on("activate", () => openWindow());
  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
  app.on("before-quit", () => {
    server.close();
  });
}

app
  .whenReady()
  .then(boot)
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
