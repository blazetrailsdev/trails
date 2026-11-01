import { stdout } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { Annotation, SourceAnnotationExtractor } from "../source-annotation-extractor.js";

export class NotesCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("annotations", {
      aliases: "-a",
      desc: "Filter by specific annotations, e.g. Foobar TODO",
      type: "array",
    });
    klass.desc("notes", "Show comments in your code annotated with FIXME, OPTIMIZE, and TODO");
    klass.methodAdded("perform");
  }

  async perform(..._args: string[]): Promise<void> {
    await this.bootApplicationBang();

    this.displayAnnotations();
  }

  /**
   * @internal
   * @inventedArm write — CONVERGEABLE notes-and-stats-output-is-printed-by-extractor-and-code-statistics
   */
  private displayAnnotations(): void {
    const annotations = (this.options as unknown as { annotations?: string[] }).annotations;
    const tags = annotations ?? Annotation.tags;
    const tag = tags.length > 1;

    stdout.write(
      SourceAnnotationExtractor.enumerate(tags.join("|"), { tag, dirs: this.directories() }),
    );
  }

  /** @internal */
  private directories(): string[] {
    return Annotation.directories;
  }
}
