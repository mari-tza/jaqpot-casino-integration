import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CASINO_SECRET: z.string().min(16, "must be at least 16 characters"),
  PROVIDER_SECRET: z.string().min(16, "must be at least 16 characters"),
  /** How this casino identifies itself to providers. */
  CASINO_CODE: z.string().min(1).default("HOUSE"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = z.infer<typeof Env>;

/** Throws listing every invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return result.data;
}

let cached: Config | undefined;

/** Lazy, so tests can set the environment first. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
