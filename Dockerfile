FROM node:14-alpine
ENV NODE_ENV=production
WORKDIR /src
COPY . .
RUN npm install
CMD node index.js
