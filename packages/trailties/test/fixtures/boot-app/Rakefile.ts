import { Trails } from "@blazetrails/trailties";

import "./config/application.ts";

await Trails.application!.loadTasks();
