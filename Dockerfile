FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
EXPOSE 4173
USER node
CMD ["node", "server.js"]
