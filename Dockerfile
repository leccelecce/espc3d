FROM node:20-alpine

WORKDIR /app

RUN apk --no-cache add tar curl

COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

RUN npm run build

EXPOSE 3001

USER node

CMD [ "npm", "start" ]
