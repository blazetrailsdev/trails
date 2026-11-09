import { Application } from "../../../../lib/application.js";

import "../../../../lib/all.js";

export class BootApp extends Application {}

Application.register(BootApp, import.meta.dirname);
