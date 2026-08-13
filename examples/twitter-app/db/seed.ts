// Entry point for `pnpm db:seed`.
//
// TODO(0104-twitter-app-full-stack-integration/cli-cannot-load-typescript-app-code):
// `trails db seed` imports db/seeds.ts under plain node, which cannot resolve
// the `./x.js` specifiers TypeScript emits for `./x.ts` sources. Any seeds
// file that imports app models therefore fails to load. Run it under tsx
// until the CLI installs a TypeScript loader.
import seed from "./seeds.js";

await seed();
process.exit(0);
