import { setArg0 } from "@blazetrails/ruby-compat/process-adapter";
import { run } from "./cli.js";

setArg0("ar");

run(process.argv.slice(2), process.cwd()).then(
  (code) => process.exit(code),
  (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ar: ${message}`);
    process.exit(1);
  },
);
