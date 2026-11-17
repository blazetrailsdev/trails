import { Trails } from "@blazetrails/trailties";
import { hours, isPresent } from "@blazetrails/activesupport";
import { env } from "@blazetrails/ruby-compat";

Trails.application!.configure(function () {
  this.config.cacheClasses = true;
  this.config.eagerLoad = isPresent(env.CI);
  this.config.publicFileServer.enabled = true;
  this.config.publicFileServer.headers = { "Cache-Control": `public, max-age=${hours(1).toI()}` };
  this.config.considerAllRequestsLocal = true;
  this.config.actionController.performCaching = false;
  this.config.actionDispatch.showExceptions = "none";
  this.config.actionController.allowForgeryProtection = true;
  this.config.activeSupport.deprecation = "stderr";
});
