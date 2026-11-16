import { Trails } from "@blazetrails/trailties";

Trails.application.configure(function () {
  // Replace the default in-process memory cache store with a durable alternative.
  // this.config.cacheStore = ":mem_cache_store";
});
