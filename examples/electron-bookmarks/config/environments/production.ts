import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = false;
  this.config.eagerLoad = true;
  this.config.considerAllRequestsLocal = false;
  this.config.actionController.performCaching = true;
  this.config.logLevel = process.env.TRAILS_LOG_LEVEL ?? "warn";
  this.config.activeSupport.reportDeprecations = false;
  this.config.activeRecord.dumpSchemaAfterMigration = false;
});
