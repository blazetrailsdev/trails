import { env as ENV, rbArgv, setEnv } from "@blazetrails/ruby-compat";

setEnv("TRAILS_ENV", ENV["TRAILS_ENV"] || ENV["RACK_ENV"]);

const { CLI } = await import("../cli.js");

const cli = CLI;
await cli.requireFrameworkLibraries();

await cli.start(rbArgv());
