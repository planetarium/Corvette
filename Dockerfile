FROM denoland/deno:alpine-1.35.2 as common
WORKDIR /Corvette
COPY . .
RUN apk add npm && \
  corepack enable && \
  cat prisma/schema.prisma | \
  awk '/generator[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "  binaryTargets = [\"native\", \"linux-musl-openssl-3.0.x\"]"; next }1' | \
  awk '/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ flag=1 } /}/ { flag=0 } (flag && /provider[[:space:]]*=/) { print "  provider = \"postgresql\""; next } (flag && /directUrl[[:space:]]*=/) { next } { print }' \
  > prisma/schema.prisma.new && \
  mv prisma/schema.prisma.new prisma/schema.prisma && \
  deno task prisma format && \
  deno task prisma generate

FROM common as observer
RUN deno cache observer.ts
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "observer.ts" ]

FROM common as emitter
RUN deno cache emitter.ts
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "emitter.ts" ]

FROM common as api
ENV API_URL="http://0.0.0.0:80"
RUN deno cache api.ts
EXPOSE 80
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "api.ts" ]

FROM common as web
WORKDIR /Corvette/web
ARG DENO_DEPLOYMENT_ID
RUN apk add git && \
  echo "DENO_DEPLOYMENT_ID=$(git rev-parse HEAD | cut -c -7)-$(date -u +%Y%m%d%H%M%S)" > .env && \
  [ ! -z "$DENO_DEPLOYMENT_ID" ] && echo "DENO_DEPLOYMENT_ID=$DENO_DEPLOYMENT_ID" > .env ; \
  deno cache main.ts && \
  deno cache ../scripts/run-with-env.ts
ENV WEBUI_URL="http://0.0.0.0:80"
EXPOSE 80
ENTRYPOINT [ "deno", "run", "--allow-read", "--allow-env", "--allow-sys", "--allow-run", "../scripts/run-with-env.ts", "deno", "run", "--allow-env", "--allow-read", "--allow-write", "--allow-net", "--allow-run", "--allow-ffi", "main.ts" ]
