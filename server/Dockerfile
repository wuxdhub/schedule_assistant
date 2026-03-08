# ---- builder 阶段 ----
FROM node:18-alpine AS builder

# 安装编译工具链 + canvas 所需头文件
RUN apk add --no-cache \
    python3 make g++ \
    openssl \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    libjpeg-turbo-dev \
    freetype-dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# 裁剪掉 devDependencies，保留编译好的原生模块
RUN npm prune --omit=dev

# ---- 生产阶段 ----
FROM node:18-alpine

# 只装运行时动态库，不需要 -dev 编译头文件
RUN apk add --no-cache \
    openssl \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    freetype

WORKDIR /app

# 直接从 builder 复制已裁剪的 node_modules（含编译好的 canvas）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p uploads/originals uploads/shared

EXPOSE 3001
CMD ["node", "dist/index.js"]
