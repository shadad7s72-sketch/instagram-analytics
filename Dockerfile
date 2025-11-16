# Multi-stage Dockerfile: build frontend then run backend
FROM node:18-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:18-alpine AS backend
WORKDIR /app
# copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production
COPY backend ./backend
# copy built frontend into backend/public or frontend/dist
COPY --from=build-frontend /app/frontend/dist ./backend/dist
ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 3000
CMD ["node","server.js"]
