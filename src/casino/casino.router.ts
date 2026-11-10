import { Router } from "express";
import { asyncRoute } from "../shared/http/asyncRoute";
import { requireCasinoSignature } from "../shared/http/requireSignature";
import { creditRoute } from "./routes/credit.route";
import { debitRoute } from "./routes/debit.route";
import { getBalance } from "./routes/getBalance.route";
import { rollbackRoute } from "./routes/rollback.route";

export const casinoRouter = Router();

// Provider callbacks
casinoRouter.post("/getBalance", requireCasinoSignature, asyncRoute(getBalance));
casinoRouter.post("/debit", requireCasinoSignature, asyncRoute(debitRoute));
casinoRouter.post("/credit", requireCasinoSignature, asyncRoute(creditRoute));
casinoRouter.post("/rollback", requireCasinoSignature, asyncRoute(rollbackRoute));
