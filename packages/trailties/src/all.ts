import "./rails.js";
import { LoadError, rbFRequire } from "@blazetrails/ruby-compat";
export type {} from "./trailties/active-record.js";
export type {} from "./trailties/action-controller.js";
export type {} from "./trailties/action-view.js";
export type {} from "./trailties/active-job.js";

const activeStorageEngine = "@blazetrails/activestorage/engine";
const loadPath: Record<string, () => Promise<unknown>> = {
  "active_record/railtie": () => import("./trailties/active-record.js"),
  "active_storage/engine": () => import(activeStorageEngine),
  "action_controller/railtie": () => import("./trailties/action-controller.js"),
  "action_view/railtie": () => import("./trailties/action-view.js"),
  "active_job/railtie": () => import("./trailties/active-job.js"),
  "action_cable/engine": () => import("./trailties/action-cable.js"),
  "rails/test_unit/railtie": () => import("./test-unit/trailtie.js"),
};

for (const railtie of [
  "active_record/railtie",
  "active_storage/engine",
  "action_controller/railtie",
  "action_view/railtie",
  "action_mailer/railtie",
  "active_job/railtie",
  "action_cable/engine",
  "action_mailbox/engine",
  "action_text/engine",
  "rails/test_unit/railtie",
]) {
  try {
    await rbFRequire(loadPath, railtie);
  } catch (e) {
    if (!(e instanceof LoadError)) throw e;
  }
}
