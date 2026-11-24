import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.enableReloading = false;
  this.config.eagerLoad = false;
  this.config.considerAllRequestsLocal = true;
  this.config.cacheStore = ":null_store";
  this.config.actionDispatch.showExceptions = "rescuable";
  this.config.actionController.allowForgeryProtection = false;
  this.config.activeSupport.deprecation = "stderr";
  this.config.actionController.raiseOnMissingCallbackActions = true;
  this.config.activeStorage.service = "test";
});
