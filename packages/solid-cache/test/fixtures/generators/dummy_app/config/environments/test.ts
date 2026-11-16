import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  this.config.cacheStore = ":null_store";
});
