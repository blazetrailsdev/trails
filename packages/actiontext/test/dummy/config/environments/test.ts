import type {} from "@blazetrails/activestorage/engine";
import { Trails } from "@blazetrails/trailties";
import { hours } from "@blazetrails/activesupport";

Trails.application!.configure(function () {
  this.config.enableReloading = false;
  this.config.eagerLoad = false;
  this.config.publicFileServer.headers = { "Cache-Control": `public, max-age=${hours(1).toI()}` };
  this.config.considerAllRequestsLocal = true;
  this.config.actionController.performCaching = false;
  this.config.cacheStore = ":null_store";
  this.config.actionDispatch.showExceptions = "rescuable";
  this.config.actionController.allowForgeryProtection = false;
  this.config.activeStorage.service = "test";
  this.config.actionMailer.performCaching = false;
  this.config.actionMailer.deliveryMethod = "test";
  this.config.activeSupport.deprecation = "stderr";
  this.config.activeSupport.disallowedDeprecation = "raise";
  this.config.activeSupport.disallowedDeprecationWarnings = [];
  this.config.actionController.raiseOnMissingCallbackActions = true;
});
