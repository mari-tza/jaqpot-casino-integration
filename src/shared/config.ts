import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CASINO_SECRET: z.string().min(16, "must be at least 16 characters"),
  PROVIDER_SECRET: z.string().min(16, "must be at least 16 characters"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = z.infer<typeof Env>;

/** Parses the environment and fails with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return result.data;
}

let cached: Config | undefined;

/** Loaded on first use, so tests can set the environment before importing the app. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
