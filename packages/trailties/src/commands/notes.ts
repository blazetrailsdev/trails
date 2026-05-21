import { Command } from "commander";
import { stdout } from "@blazetrails/activesupport/process-adapter";
import { SourceAnnotationExtractor } from "../source-annotation-extractor.js";

export function notesCommand(): Command {
  const cmd = new Command("notes");
  cmd
    .description("Enumerate annotations (FIXME, TODO, OPTIMIZE) in your source")
    .option(
      "-a, --annotations <tags...>",
      "Filter notes by custom annotations (e.g. FIXME RELEASE)",
    )
    .action(async (opts: { annotations?: string[] }) => {
      const annotations = opts.annotations;
      let tag: string | null = null;
      let showTag = true;
      if (annotations && annotations.length > 0) {
        tag = annotations.join("|");
        showTag = annotations.length > 1;
      }
      const output = await SourceAnnotationExtractor.enumerate(tag, { tag: showTag });
      stdout.write(output);
    });
  return cmd;
}
