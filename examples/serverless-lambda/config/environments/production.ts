import { TaggedLogging } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = false;

  this.config.eagerLoad = true;

  this.config.considerAllRequestsLocal = false;

  this.config.logger = TaggedLogging.logger(process.stdout);

  this.config.logLevel = process.env.TRAILS_LOG_LEVEL ?? "info";
});
