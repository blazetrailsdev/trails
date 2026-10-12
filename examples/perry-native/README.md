# perry-native

This application was generated with [trails](https://github.com/blazetrailsdev/blazetrails).

It exists to answer one question: **can a trails application be compiled to a
native binary by [Perry](https://www.perryts.com), an ahead-of-time
TypeScript→native compiler?** Everything in `app/`, `config/`, `db/` and
`test/` is stock generator output, deliberately — the subject under test is
what `trails new` and `trails g scaffold` actually emit, so nothing here is
written to suit Perry.

The experiment, how to re-run it, and what it found all live in
[`perry/`](perry/README.md). The measured answer today is no, blocked on two
walls in Perry itself; [`perry/FINDINGS.md`](perry/FINDINGS.md) has the detail.
Nothing in that result asks trails to change.

The rest of this README is the generated scaffold's own.

## Getting started

    cd perry-native
    pnpm install
    pnpm db:setup
    pnpm dev

Every command below that executes application code — anything that imports a
model, `config/database.ts`, or `config/routes.ts` — must run through the
`tsx` loader, because the app's sources are TypeScript and `Node16`
resolution spells its imports with a `.js` extension that has no file behind
it until the loader transforms them. The generated `package.json` scripts and
the `bin/` binstubs already do this, so every command below is loader-backed.
To reach a CLI command with no script of its own, use the `bin/trails`
binstub:

    bin/trails routes
    bin/trails console

## Commands

| Command                               | Description                     |
| ------------------------------------- | ------------------------------- |
| `pnpm dev`                            | Start the development server    |
| `bin/trails generate model NAME`      | Generate a new model            |
| `bin/trails generate controller NAME` | Generate a new controller       |
| `bin/trails generate scaffold NAME`   | Generate a full CRUD resource   |
| `pnpm db:migrate`                     | Run pending database migrations |
| `pnpm db:seed`                        | Seed the database               |
| `pnpm test`                           | Run the test suite              |

## Configuration

- Database: `config/database.ts`
- Routes: `config/routes.ts`
- Environment-specific: `config/environments/`
