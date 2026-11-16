import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  if (Trails.root.join("tmp/caching-dev.txt").isExist()) {
    this.config.actionController.performCaching = true;
    this.config.cacheStore = ":memory_store";
  } else {
    this.config.actionController.performCaching = false;
    this.config.cacheStore = ":null_store";
  }
});
