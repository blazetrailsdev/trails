import { env as ENV, setEnv } from "@blazetrails/ruby-compat/process-adapter";

if (ENV["TRAILS_ENV"] == null) setEnv("TRAILS_ENV", "test");
