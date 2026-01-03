# 后端 Dockerfile
FROM node:18-alpine

# 安装系统依赖（canvas 需要）
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --omit=dev

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 创建上传目录
RUN mkdir -p uploads/originals uploads/shared

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["npm", "start"]