import { beforeAll } from "vitest";
import { resetCasino } from "./helpers/casino";
import { resetProvider } from "./helpers/provider";

// Rounds played by hand (npm run simulate) leave balances and rows behind.
beforeAll(async () => {
  await resetCasino();
  await resetProvider();
});
