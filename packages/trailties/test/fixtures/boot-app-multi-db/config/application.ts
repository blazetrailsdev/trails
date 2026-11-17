import { Application } from "../../../../lib/application.js";

import "../../../../lib/all.js";

export class BootMultiDbApp extends Application {}

Application.register(BootMultiDbApp, import.meta.dirname);
