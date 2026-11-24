import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = true;
  this.config.eagerLoad = false;
  this.config.considerAllRequestsLocal = true;
  this.config.cacheStore = ":memory_store";
  this.config.activeSupport.deprecation = "log";
  this.config.activeRecord.migrationError = "page_load";
  this.config.actionController.raiseOnMissingCallbackActions = true;
  this.config.activeStorage.service = "local";
});
