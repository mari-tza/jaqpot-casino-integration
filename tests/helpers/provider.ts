import request from "supertest";
import { createApp } from "../../src/app";
import { config } from "../../src/shared/config";
import { prisma } from "../../src/shared/db/prisma";
import { signJson } from "../../src/shared/http/signature";

const app = createApp();

/** Signed casino → provider call. */
export function providerPost(path: string, body: object) {
  const { raw, signature } = signJson(body, config().PROVIDER_SECRET);
  return request(app)
    .post(`/provider${path}`)
    .set("content-type", "application/json")
    .set("x-provider-signature", signature)
    .send(raw);
}

export async function resetProvider() {
  await prisma.providerBet.deleteMany();
  await prisma.providerGameRound.deleteMany();
  await prisma.providerGameSession.deleteMany();
  await prisma.providerCustomer.deleteMany();
}
