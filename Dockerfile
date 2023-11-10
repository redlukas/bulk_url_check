# syntax=docker/dockerfile:1

FROM node:current-alpine
ENV NODE_ENV=production

WORKDIR /app

ENV USER=appuser
ENV UID=12345
ENV GID=23456

RUN addgroup -S appgroup

RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "$(pwd)" \
    --ingroup "appgroup" \
    --no-create-home \
    --uid "$UID" \
    "$USER"

RUN chown -R $USER /app

USER $USER

COPY ["package.json", "package-lock.json*", "./"]

USER root

RUN npm install --omit=dev

USER $USER

COPY . .

CMD [ "node", "main.js" ]
