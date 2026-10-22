import { File, RuntimeError, rbInspect, FileUtils, Tempfile } from "@blazetrails/ruby-compat";

export function imagePath(type: string = "default") {
  let path: unknown;
  if (type !== "jpg_without_extension") {
    return File.join(
      "spec/fixtures",
      (() => {
        if (type === "default" || type === "jpg") {
          return "default.jpg";
        } else if (type === "png") {
          return "engine.png";
        } else if (type === "animation" || type === "gif") {
          return "animation.gif";
        } else if (type === "exif") {
          return "exif.jpg";
        } else if (type === "no_exif") {
          return "no_exif.jpg";
        } else if (type === "not") {
          return "not_an_image.rb";
        } else if (type === "colon") {
          return "with:colon.jpg";
        } else if (type === "clipping_path") {
          return "clipping_path.jpg";
        } else if (type === "get_pixels") {
          return "get_pixels.png";
        } else if (type === "rgb") {
          return "rgb.png";
        } else if (type === "rgb_tmp") {
          return "rgb_tmp.png";
        } else if (type === "non_ascii_filename") {
          return "スクリーンショット 2019-07-13 1.32.01.png";
        } else if (type === "large_webp") {
          return "large_webp.webp";
        } else {
          throw new RuntimeError(`image ${rbInspect(type)} doesn't exist`);
        }
      })(),
    );
  } else {
    path = randomPath();
    FileUtils.cp(imagePath() as string | string[], path as string);
    return path;
  }
}

export function randomPath(basename: string | string[] = "") {
  this._tempfile = Tempfile.open(basename);
  return this._tempfile.path();
}
