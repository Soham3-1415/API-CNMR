### Global args
ARG PORT=3000
ARG APP=/usr/app
ARG APP_USER=appuser

### Stage 1 (setup prod env)
FROM node:current-alpine as pre-squash
ARG PORT
ARG APP
ARG APP_USER

RUN adduser --disabled-password --system --no-create-home --shell /sbin/nologin $APP_USER \
    && mkdir -p ${APP}

EXPOSE $PORT/tcp    
ENV PORT $PORT

WORKDIR ${APP}

COPY ./package.json ./package.json

RUN npm install

COPY ./index.js ./index.js

RUN chown -R $APP_USER: ${APP}
USER $APP_USER

CMD node ./index.js
