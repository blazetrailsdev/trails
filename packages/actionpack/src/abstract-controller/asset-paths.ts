/** @internal */

import { included } from "@blazetrails/activesupport";

export interface AssetPathsHost {
  assetHost?: string;
  assetsDir?: string;
  javascriptsDir?: string;
  stylesheetsDir?: string;
  defaultAssetHostProtocol?: string;
  relativeUrlRoot?: string;
}

/** @internal */
export type AssetPathsIncludingClass = (new (...args: never[]) => unknown) & {
  configAccessor(...names: string[]): void;
};

export class AssetPaths {
  static [included](base: AssetPathsIncludingClass): void {
    base.configAccessor(
      "assetHost",
      "assetsDir",
      "javascriptsDir",
      "stylesheetsDir",
      "defaultAssetHostProtocol",
      "relativeUrlRoot",
    );
  }
}
