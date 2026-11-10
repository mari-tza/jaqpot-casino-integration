FROM node:20-alpine

WORKDIR /app
# Prisma's query engine needs OpenSSL.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

EXPOSE 3000
# Migrations and seed are idempotent, so every start is safe.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run -s db:seed && node dist/server.js"]
