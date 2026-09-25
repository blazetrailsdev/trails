import { Dir, File } from "@blazetrails/ruby-compat";

export interface BehaviorHost {
  destinationRoot: string;
}

/** @internal */
export function migrationFileName(this: BehaviorHost, relative: string): string | undefined {
  const absolute = File.expandPath(relative, this.destinationRoot);
  const [dirname, fileName] = [
    File.dirname(absolute),
    File.basename(absolute).replace(/\.ts$/, ""),
  ];
  return Dir.glob(`${dirname}/[0-9]*_*.ts`).filter((f) =>
    new RegExp(`\\d+_${fileName}.ts$`).test(f),
  )[0];
}
