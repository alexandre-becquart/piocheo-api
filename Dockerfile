FROM node:22-alpine
WORKDIR /app
COPY --chmod=0644 package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -r /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev
COPY --chmod=0644 app.js server.js ./
COPY _helpers/ ./_helpers/
COPY _middleware/ ./_middleware/
COPY controllers/ ./controllers/
COPY models/ ./models/
COPY routes/ ./routes/
COPY services/ ./services/
COPY templates/ ./templates/
RUN chmod -R a+rX _helpers _middleware controllers models routes services templates
ENV HOST=0.0.0.0
USER node
EXPOSE 3100
CMD ["node", "server.js"]
