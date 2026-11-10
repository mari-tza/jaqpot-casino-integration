import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/shared/config";

const valid = { CASINO_SECRET: "c".repeat(16), PROVIDER_SECRET: "p".repeat(16) };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(valid)).toMatchObject({ PORT: 3000, LOG_LEVEL: "info" });
  });

  it("lists every missing or weak secret", () => {
    expect(() => loadConfig({ CASINO_SECRET: "short" })).toThrow(
      /CASINO_SECRET: must be at least 16 characters[\s\S]*PROVIDER_SECRET/,
    );
  });
});
