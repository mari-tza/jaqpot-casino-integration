import "dotenv/config";
import { createApp } from "./app";
import { config } from "./shared/config";

// Fail fast on a missing or weak secret instead of rejecting every request later.
const { PORT } = config();

createApp().listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
