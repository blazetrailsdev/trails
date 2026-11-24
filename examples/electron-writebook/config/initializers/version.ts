import { Trails } from "@blazetrails/trailties";

Trails.application.config.appVersion = process.env.APP_VERSION ?? "0";
Trails.application.config.gitRevision = process.env.GIT_REVISION;
