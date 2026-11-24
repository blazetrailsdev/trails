import { Trails } from "@blazetrails/trailties";

// The packaged desktop app. It only listens on 127.0.0.1, so there is no SSL
// and no proxy in front of it.
Trails.application.configure(function () {
  this.config.enableReloading = false;
  this.config.eagerLoad = true;
  this.config.considerAllRequestsLocal = false;
  this.config.actionController.performCaching = true;
  this.config.logLevel = process.env.TRAILS_LOG_LEVEL ?? "warn";
  this.config.activeSupport.reportDeprecations = false;
  this.config.activeRecord.dumpSchemaAfterMigration = false;
});
