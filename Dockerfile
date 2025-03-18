FROM node:20.19-alpine

WORKDIR /app

COPY package.json .
COPY yarn.lock .

RUN yarn

COPY . .

RUN yarn build

EXPOSE 3005
EXPOSE 27018

CMD [ "yarn", "start:prod" ]