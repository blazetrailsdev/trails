import { ActiveStorage } from "@blazetrails/activestorage";
import { Trails } from "@blazetrails/trailties";

// Disable unfuzzed libvips operations.
//
// Load Active Storage's vips support to ensure Vips is loaded before we block operations.
await ActiveStorage.loadPath["active_storage/vips"]();
const { vips: Vips } = await import("@blazetrails/image-processing/vips");
Vips.blockUntrusted(true);
Vips.operationBlock("VipsForeignLoadOpenslide", true); // prevent sqlite segfault in forked parallel workers
const activeStorage = Trails.application.config.activeStorage;
activeStorage.variableContentTypes = (activeStorage.variableContentTypes ?? []).filter(
  (type) => !["image/bmp", "image/vnd.microsoft.icon", "image/vnd.adobe.photoshop"].includes(type),
);
