# y-websocket server Dockerfile (Node 20)
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY ./server.js ./

EXPOSE 1234
ENV PORT=1234

CMD ["node", "server.js"]



