import { env as ENV } from "@blazetrails/ruby-compat/process-adapter";

ENV["TRAILS_ENV"] ??= "test";
