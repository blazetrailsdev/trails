import { setLoadImporter } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

// Load the trails application.
import "./application.ts";

Trails.autoloaders.each((loader) => {
  loader.importer = (url) => import(url);
});
setLoadImporter((url) => import(url));

// Initialize the trails application.
export default await Trails.initialize();
