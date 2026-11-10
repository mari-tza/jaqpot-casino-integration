import { Router } from "express";
import { asyncRoute } from "../shared/http/asyncRoute";
import { requireProviderSignature } from "../shared/http/requireSignature";
import { launchRoute } from "./routes/launch.route";

export const providerRouter = Router();

// Called by the casino
providerRouter.post("/launch", requireProviderSignature, asyncRoute(launchRoute));
