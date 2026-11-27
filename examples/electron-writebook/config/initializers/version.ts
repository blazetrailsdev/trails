import { Trails } from "@blazetrails/trailties";

const config = Trails.application.config as unknown as {
  appVersion: string;
  gitRevision: string | undefined;
};

config.appVersion = process.env.APP_VERSION ?? "0";
config.gitRevision = process.env.GIT_REVISION;
