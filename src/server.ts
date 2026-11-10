import "dotenv/config";
import { createApp } from "./app";
import { config } from "./shared/config";
import { logger } from "./shared/logger";

// Fail fast on a missing or weak secret instead of rejecting every request later.
const { PORT } = config();

createApp().listen(PORT, () => {
  logger.info({ port: PORT }, `Server listening on http://localhost:${PORT}`);
});
