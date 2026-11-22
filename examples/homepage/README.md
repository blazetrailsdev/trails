# Home page example

The slice of a trails blog that the [blazetrails.dev](https://blazetrails.dev) home page shows. Each file uses
several frameworks: the `Post` model uses Active Record, Active Storage, Action Text, Active Record encryption,
Turbo broadcasts and an Active Job callback. The job delivers an Action Mailer email, and the controller and
view are Action Pack and Action View.

This is not a runnable app. `pnpm typecheck` checks its TypeScript.
