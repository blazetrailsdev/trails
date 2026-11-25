import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { isolateEmbedProviders, setEmbedProviders } from "../embed-providers-env.ts";
import { ApplicationController } from "../../app/controllers/application-controller.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";

describe("PagesHelperTest", () => {
  const sanitizeContent = (html: string) =>
    String(
      (
        ApplicationController.helpers() as unknown as Record<string, (h: string) => unknown>
      ).sanitizeContent(html),
    );
  const withAllowlist = async (block: () => void) => {
    await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));
    block();
  };

  beforeEach(resetDatabase);
  isolateEmbedProviders();

  it("sanitize_content keeps an iframe from any origin while embeds are permissive", () => {
    const html = `<iframe src="https://anything.example/embed/x" allow="camera *" onload="alert(1)" allowfullscreen></iframe>`;
    const result = sanitizeContent(html);

    expect(result).toContain(`src="https://anything.example/embed/x"`);
    expect(result).toContain("allowfullscreen");
    expect(result).not.toContain("allow=");
    expect(result).not.toContain("onload");
  });

  it("sanitize_content keeps an approved-provider iframe", async () => {
    await withAllowlist(() => {
      const html = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`;
      const result = sanitizeContent(html);

      expect(result).toContain("<iframe");
      expect(result).toContain(`src="https://www.youtube.com/embed/dQw4w9WgXcQ"`);
    });
  });

  it("sanitize_content strips a disallowed-origin iframe", async () => {
    await withAllowlist(() => {
      const html = `<iframe src="https://evil.example/embed/x"></iframe>`;
      expect(sanitizeContent(html)).not.toContain("<iframe");
    });
  });

  it("sanitize_content strips a valid host used with the wrong path shape", async () => {
    await withAllowlist(() => {
      const html = `<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe>`;
      expect(sanitizeContent(html)).not.toContain("<iframe");
    });
  });

  it("sanitize_content strips forbidden attributes from an approved iframe", async () => {
    await withAllowlist(() => {
      const html =
        `<iframe src="https://player.vimeo.com/video/76979871" ` +
        `srcdoc="<script>alert(1)</script>" sandbox="" onload="alert(1)" name="x" ` +
        `style="position:fixed" allow="camera *" referrerpolicy="unsafe-url" ` +
        `width="640" allowfullscreen></iframe>`;
      const result = sanitizeContent(html);

      expect(result).toContain("<iframe");
      for (const forbidden of [
        "srcdoc=",
        "sandbox=",
        "onload=",
        "name=",
        "style=",
        "allow=",
        "referrerpolicy=",
      ]) {
        expect(result).not.toContain(forbidden);
      }
      expect(result).toContain(`width="640"`);
      expect(result).toContain("allowfullscreen");
    });
  });

  it("sanitize_content strips a bare srcdoc iframe with no src", async () => {
    await withAllowlist(() => {
      const html = `<iframe srcdoc="<script>alert(1)</script>"></iframe>`;
      expect(sanitizeContent(html)).not.toContain("<iframe");
    });
  });
});
