import { FixtureSet } from "../../../fixture-set.js";

export const blobs = async () => ({
  first_avatar_blob: JSON.parse(
    await FixtureSet.blob({ filename: "racecar.jpg", content_type: "image/jpeg+override" }),
  ) as Record<string, unknown>,
});
