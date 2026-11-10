import { PrismaClient } from "@prisma/client";

/** One client (and connection pool) per process. */
export const prisma = new PrismaClient();
