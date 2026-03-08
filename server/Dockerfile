# ---- builder 阶段 ----
FROM node:18-alpine AS builder

# 换国内 apk 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装编译工具链
RUN apk add --no-cache \
    python3 make g++ \
    openssl

WORKDIR /app

# 换国内 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npx prisma generate && npm run build

# 裁剪掉 devDependencies，保留编译好的原生模块
RUN npm prune --omit=dev

# ---- 生产阶段 ----
FROM node:18-alpine

# 换国内 apk 镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 只装运行时动态库 + 中文字体
RUN apk add --no-cache \
    openssl \
    font-noto-cjk

WORKDIR /app

# 直接从 builder 复制已裁剪的 node_modules（含编译好的 canvas）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p uploads/originals uploads/shared

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/scripts/initUsers.js && node dist/index.js"]
