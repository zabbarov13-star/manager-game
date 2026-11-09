FROM node:24-bookworm-slim
WORKDIR /app
COPY index.html sw.js manifest.webmanifest manager-icon.png ./
COPY online/generate.cjs online/public-build.cjs online/rounded-icon.png online/entrances.cjs online/server.cjs ./online/
ARG ROOM_ENTRANCES=""
RUN ROOM_ENTRANCES="$ROOM_ENTRANCES" node online/generate.cjs && mkdir /data && chown node:node /data
USER node
ENV ROOM_BIND=0.0.0.0 ROOM_DATABASE=/data/rooms.sqlite
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "online/server.cjs"]
