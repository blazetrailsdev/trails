# Bookshelf: a trails port of Writebook, inside Electron

A port of [Writebook](https://github.com/basecamp/writebook) (v1.2.9, MIT, © 37signals) to trails,
running as a desktop app in Electron. Writebook is 37signals' book-authoring app. You can write
books made of text pages, sections and pictures, rearrange them, publish them, search them, and
invite readers and writers. This port keeps Writebook's Rails structure: models, concerns,
migrations, controllers, routes, views (as `.tse`), helpers, CSS and Stimulus controllers. The
upstream source is vendored at `vendor/writebook/v1.2.9` (`vendor/sources.ts`). Each file here
mirrors the file of the same name there.

"Writebook" and its logo are 37signals' marks. This example uses the name **Bookshelf** and leaves
out the Writebook icon, the bundled _Writebook Manual_ demo book and links to once.com. The
code, stylesheets and icons are used under the MIT license.

## How it runs

`electron/main.ts` boots trails, runs `DatabaseTasks.prepareAll()`, serves the app with rackup's
Node handler on a random `127.0.0.1` port, and opens a `BrowserWindow` on it. The database is
SQLite through the `node-sqlite` adapter, so nothing needs rebuilding for Electron's ABI. Uploads
go to Active Storage's disk service. In production, both live in the OS app-data directory.

| Writebook (Rails 8)                  | Here                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| importmap + propshaft                | Vite bundles `app/javascript`; `pnpm build:assets` copies `app/assets` flat to `/assets` |
| `stimulus-loading` eager load        | the static manifest `bin/trails stimulus:manifest:update` writes                         |
| Stimulus controllers, `house.min.js` | copied byte-for-byte                                                                     |
| redcarpet + rouge                    | `lib/redcarpet.ts`, a stand-in over `marked` (story `redcarpet-port`)                    |
| rqrcode QR dialogs                   | omitted (story `rqrcode-port`)                                                           |
| jbuilder upload response             | `render json:` (story `jbuilder-port`)                                                   |
| `Migration[8.2]`                     | `Migration.get(8.0)`; trails targets Rails 8.0                                           |

## Framework stories it waits on

The example needs these framework fixes, filed as their own stories. Until they land it does not
boot:

- `secure-random-alphanumeric`: join codes and attachment slugs
- `set-signed-id-verifier-secret-initializer`: session transfer links
- `button-to-awaits-template-block`: every `button_to` with a block
- `quote-safe-buffer-as-string`: the page search index
- `nokogiri-html5-read-and-encode`: sanitizing rendered Markdown
- `http-uploaded-file-seated`: covers and pictures
- `delegated-type-takes-belongs-to-options`: `Leaf`'s `dependent: :destroy`
- `mime-type-register-reachable`: the `format.md` responses, which are not ported yet

## Running it

From the repo root, run `pnpm install` and `pnpm build` once. Then, from this directory:

```sh
pnpm build   # compile the views and the JavaScript/CSS
pnpm start   # electron .
```

The first launch asks you to create the administrator account. `bin/trails server` serves the
same app in a browser. If `pnpm start` says "Electron failed to install correctly", run
`node install.js` inside `node_modules/electron`.

## Tests

```sh
TRAILS_ENV=test bin/trails db:prepare
pnpm test
```

The integration tests drive the app through its controllers. They cover first run, sign-in,
joining, profiles, custom styles, books, pages, sections, pictures, edit history, reordering,
trashing, publishing and full-text search.
