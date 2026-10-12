// A leaf import from a @blazetrails package: no DB, no Proxy at the call site.
import { camelize, underscore } from "@blazetrails/activesupport";
console.log(`[04] ${camelize("trail_name")} ${underscore("TrailName")}`);
