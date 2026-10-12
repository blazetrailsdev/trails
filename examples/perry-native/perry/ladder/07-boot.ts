// Full framework boot: initializers, autoloading, routes.
import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";

const app = Trails.application!;
console.log(`[07] booted env=${Trails.env} routes=${app.routes().routes.length}`);
