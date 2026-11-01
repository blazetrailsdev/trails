import { Trails } from "@blazetrails/trailties";

import "./config/environment.ts";

export default Trails.application;

await Trails.application.loadServer();
