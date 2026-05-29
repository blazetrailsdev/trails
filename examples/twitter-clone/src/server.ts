import { connect, loadModelSchemas } from "./db.js";
import { hasPendingMigrations } from "./migrator.js";
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  await connect();

  // Rails refuses to boot with pending migrations; do the same and point at
  // the CLI rather than silently auto-migrating.
  if (await hasPendingMigrations()) {
    console.error("Pending migrations. Run `pnpm db:setup` (or `pnpm db:migrate`) first.");
    process.exit(1);
  }

  await loadModelSchemas();

  const app = buildApp();
  app.listen(PORT, () => {
    console.log(`Twitter clone listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
