FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY index.html manifest.webmanifest manager-icon.png sw.js ./
COPY online ./online
COPY telegram ./telegram
RUN node telegram/build.cjs && mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/telegram
ENV TELEGRAM_DATABASE=/data/telegram.sqlite BIND=0.0.0.0 PORT=8090
EXPOSE 8090
CMD ["node", "server.cjs"]
