import { Trails } from "../../../../rails.js";

Trails.application!.configure(function () {
  this.config.enableReloading = false;
  this.config.publicFileServer.headers = { "cache-control": "public, max-age=3600" };
  this.config.considerAllRequestsLocal = true;
});
