# ============ FRONTEND BUILD =============
FROM node:18-alpine AS build-frontend
WORKDIR /app/frontend

# نسخ package.json
COPY frontend/package*.json ./

# استخدم npm install بدل npm ci
RUN npm install

# نسخ باقي ملفات الواجهة
COPY frontend/ .

# بناء الواجهة
RUN npm run build

# ============ BACKEND BUILD =============
FROM node:18-alpine
WORKDIR /app

# نسخ ملفات backend
COPY backend/package*.json ./backend/

# استخدم npm install بدل npm ci
RUN cd backend && npm install --omit=dev

# نسخ باقي ملفات backend
COPY backend ./backend

# نسخ ملفات الواجهة المبنية
COPY --from=build-frontend /app/frontend/dist ./backend/public

EXPOSE 3000
CMD ["node", "backend/server.js"]
