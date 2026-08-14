// Integration fixture for `trails server` booting through
// `Trailties.Application`: the Rails layout (`config/application.ts`,
// `config/routes.ts`, `app/controllers`, `app/views`) that
// `commands/server.ts` imports and `Application#initialize` walks.
import { Application } from "../../../application.js";

export class BootApp extends Application {}
