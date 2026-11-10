import { Router } from "express";
import { asyncRoute } from "../shared/http/asyncRoute";
import { requireCasinoSignature } from "../shared/http/requireSignature";
import { debitRoute } from "./routes/debit.route";
import { getBalance } from "./routes/getBalance.route";

export const casinoRouter = Router();

// Provider callbacks
casinoRouter.post("/getBalance", requireCasinoSignature, asyncRoute(getBalance));
casinoRouter.post("/debit", requireCasinoSignature, asyncRoute(debitRoute));
