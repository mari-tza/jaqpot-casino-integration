import "dotenv/config";
import { createApp } from "./app";
import { config } from "./shared/config";
import { logger } from "./shared/logger";

// Fails fast if a secret is missing.
const { PORT } = config();

createApp().listen(PORT, () => {
  logger.info({ port: PORT }, `Server listening on http://localhost:${PORT}`);
});
