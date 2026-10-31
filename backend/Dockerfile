FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY db ./db
COPY scripts ./scripts
COPY src ./src
# Fonts for the English/Hindi "Check my plot" PDF.
COPY assets ./assets

USER node
EXPOSE 3001

CMD ["node", "src/server.js"]
