import "./rails.js";

import "./trailties/active-record.js";
import "./trailties/active-job.js";
import "./trailties/action-cable.js";
import "./trailties/action-controller.js";
import "./trailties/action-view.js";
import "./test-unit/trailtie.js";
import { rbFRequire } from "@blazetrails/ruby-compat";

const activeStorageEngine = "@blazetrails/activestorage/engine";
await rbFRequire(
  { "active_storage/engine": () => import(activeStorageEngine) },
  "active_storage/engine",
);
