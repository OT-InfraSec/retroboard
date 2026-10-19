FROM node:24-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run build && chown -R node:node /app/apps/web/.next

ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["npm", "run", "start"]
