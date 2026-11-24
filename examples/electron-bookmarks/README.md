# Reading List: trails inside Electron

A desktop reading list. It's a regular trails app, with Active Record models, Action Pack
controllers, `.tse` views and Turbo, running inside Electron's main process. The window is a
`BrowserWindow` pointed at that app on a random `127.0.0.1` port. There is no separate server
process and no IPC layer. Controllers are plain Node code in the same process, so they reach
native dialogs directly.

## Features

- **Bookmarks with tags.** Filter by tag or by unread, and mark items read or unread.
- **Import and export.** Export… opens a native save dialog and writes JSON or CSV, depending
  on the extension you pick. Import… reads either format back and skips URLs you already have.
- **Local file attachments.** Attach files… opens a native file picker. Each row records the
  file's path, name and size, and clicking a file opens it in its default application. Files
  stay where they are on disk.
- **Reminders.** Set "Remind me" on a bookmark. The main process checks every 30 seconds and
  posts a system notification once the time has passed. Clicking it opens the bookmark.
- **Tray and menus.** A tray icon shows the unread count, and on macOS the dock badge does too.
  Closing the window keeps the app running in the tray, so reminders still fire. The File and
  View menus have shortcuts: ⌘N new, ⌘O import, ⌘E export, ⌘1 all, ⌘2 unread.

## How it fits together

| Piece                   | What it does                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/main.ts`      | Boots trails (`config/environment.ts`), runs `DatabaseTasks.prepareAll()`, serves the app with rackup's Node handler, then builds the window, menu and tray.                                                                              |
| `app/models/desktop.ts` | `Desktop.shell` is the native side: dialogs, `openPath` and notifications. `main.ts` installs an Electron-backed shell; tests install a fake one; under `bin/trails server` it is `null` and native actions show a flash message instead. |
| `config/database.ts`    | Uses the `node-sqlite` adapter. Electron ships `node:sqlite`, so there's no native module to rebuild against Electron's ABI. In production the database lives in the OS app-data directory (`app.getPath("userData")`).                   |
| `secret_key_base`       | Generated on first launch and stored beside the database, since a desktop install has no deploy step to supply one.                                                                                                                       |

Electron needs to be **45 or later**: trails uses the native `Temporal` global, which older
Electron V8 builds don't have.

## Running it

From the repo root, run `pnpm install` and `pnpm build` once. Then, from this directory:

```sh
pnpm build            # compile the views and build app/javascript with Vite
bin/trails db:prepare # optional: the app also prepares its database on launch
pnpm start            # electron .
```

`pnpm start` runs in development: the database is `storage/development.sqlite3`. Run
`TRAILS_ENV=production pnpm start` to use the app-data database the way a packaged build would.
`bin/trails server` serves the same app in a browser, with the native actions turned off.

If `pnpm start` reports "Electron failed to install correctly", pnpm skipped Electron's
postinstall. Run `node install.js` inside `node_modules/electron`.

## Tests

```sh
TRAILS_ENV=test bin/trails db:prepare
pnpm test
```

The tests boot the app under Vitest with no Electron. `fakeDesktop()` in `test/test-helper.ts`
answers the dialogs, so import, export and attachments are covered end to end through the
controllers.
