import { Trails } from "@blazetrails/trailties";

import "./config/environment.ts";

export const Config = Trails.application;

await Trails.application.loadServer();
