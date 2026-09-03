import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();
register(new URL("./file-store-lock-worker-hooks.trails.mjs", import.meta.url));
