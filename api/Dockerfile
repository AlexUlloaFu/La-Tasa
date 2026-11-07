# build
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/
RUN npm ci --workspace=api

COPY api ./api
RUN npm run build --workspace=api \
  && npm prune --omit=dev --workspace=api

# run
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/api/package.json ./api/
COPY --from=build /app/api/dist ./api/dist

WORKDIR /app/api
RUN mkdir -p data

EXPOSE 3124
CMD ["node", "dist/main.js"]
