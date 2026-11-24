import { presence, squish } from "@blazetrails/activesupport";
import { File, RuntimeError, TopLevel, rbFArray, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";

type MiniMagickModule = typeof import("@blazetrails/mini-magick").MiniMagick;

let MiniMagick: MiniMagickModule;
try {
  ({ MiniMagick } = await import("@blazetrails/mini-magick"));
  ActiveStorage.MINIMAGICK_AVAILABLE = true;
} catch (error) {
  ActiveStorage.MINIMAGICK_AVAILABLE = false;
  if (!String((error as Error).message).includes("mini-magick")) throw error;
}

export const ImageMagick = {
  name: "ActiveStorage::ImageMagick",

  POLICY_DIRECTORY: File.expandPath("image-magick", import.meta.dirname),

  applyPolicy(): void {
    const operatorPaths =
      presence(
        ImageMagick.operatorPaths(
          (MiniMagick.cliEnv as Record<string, string | undefined>)["MAGICK_CONFIGURE_PATH"],
        ),
      ) ?? ImageMagick.operatorPaths(TopLevel.ENV!["MAGICK_CONFIGURE_PATH"]);

    MiniMagick.cliEnv = Object.freeze({
      ...(MiniMagick.cliEnv as Record<string, string>),
      MAGICK_CONFIGURE_PATH: ImageMagick.configurePath(operatorPaths),
    });
  },

  configurePath(operatorPath: string | string[] | null | undefined): string {
    return [ImageMagick.POLICY_DIRECTORY, ...ImageMagick.operatorPaths(operatorPath)].join(
      File.PATH_SEPARATOR,
    );
  },

  /** @internal */
  operatorPaths(path: string | string[] | null | undefined): string[] {
    return (rbFArray(path) as string[])
      .flatMap((entry) => entry.split(File.PATH_SEPARATOR))
      .filter((entry) => entry !== ImageMagick.POLICY_DIRECTORY && entry !== "");
  },
};
ActiveStorage.ImageMagick = ImageMagick;

ActiveStorage.MINIMAGICK_UNSECURABLE =
  ActiveStorage.MINIMAGICK_AVAILABLE && !rbObjRespondTo(MiniMagick!, "cliEnv=");

ActiveStorage.requireSecurableMiniMagick = function requireSecurableMiniMagick(): void {
  if (ActiveStorage.MINIMAGICK_UNSECURABLE) {
    throw new RuntimeError(
      squish(`
        Active Storage's ImageMagick security policy requires mini_magick 5.1 or later. Please add
        \`gem "mini_magick", "~> 5.1"\` to your Gemfile, or use the :vips variant processor.
      `),
    );
  }
};

if (ActiveStorage.MINIMAGICK_AVAILABLE && !ActiveStorage.MINIMAGICK_UNSECURABLE) {
  ImageMagick.applyPolicy();
}
