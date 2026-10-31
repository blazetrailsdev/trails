import { TaggedLogging } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = false;

  this.config.eagerLoad = true;

  this.config.considerAllRequestsLocal = false;

  this.config.actionController.performCaching = true;

  this.config.publicFileServer.headers = { "cache-control": "public, max-age=31556952" };

  this.config.logTags = [":request_id"];
  this.config.logger = TaggedLogging.logger(process.stdout);

  this.config.logLevel = process.env.RAILS_LOG_LEVEL ?? "warn";

  this.config.activeSupport.reportDeprecations = false;

  this.config.i18n.fallbacks = true;

  this.config.activeRecord.dumpSchemaAfterMigration = false;

  this.config.activeRecord.attributesForInspect = ["id"];
});
