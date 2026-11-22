# Home page example

The slice of a trails blog that the [blazetrails.dev](https://blazetrails.dev) home page shows. Each file uses
several frameworks: the `Post` model uses Active Record, Active Storage, Action Text, Active Record encryption,
Turbo broadcasts and an Active Job callback. The job delivers an Action Mailer email, and the controller and
view are Action Pack and Action View.

This is not a runnable app, and CI does not check it. To typecheck it locally:

```sh
pnpm --filter @blazetrails/example-homepage typecheck
```

## Type-only declarations

`ApplicationRecord` declares `hasOneAttached`, `hasRichText` and `broadcastsTo`, and `PostMailer` declares its
class-level `published`. These are types only. At boot the engines' load hooks install the class methods on
`ActiveRecord::Base` (`packages/turbo/lib/engine.ts`), and `ActionMailer::Base.method_missing` answers mailer
actions. Neither reaches a model's or mailer's static type yet. The story
`engine-installed-base-class-methods-are-untyped` tracks removing these declarations.

## The home page's compiler errors

The two errors in the home page hero come from scratch edits of this app.

- Controller: replace `PostsController`'s actions with a `destroy` action that calls `post.destory()`, then
  run `pnpm typecheck`.
- View: change `post.title` to `post.titel` in `app/views/posts/show.html.tse`, then run
  `trails-tsc-views build --views app/views --out .scratch` and `tsc --noEmit` over the generated
  `.scratch/views/posts/show.html.tse.ts` together with `app`. tsc reports the error on the generated line, and
  the home page shows it at the matching `.tse` line and column.
