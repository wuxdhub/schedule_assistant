import { PrismaClient } from '@prisma/client';

// 确保 Prisma 客户端正确初始化
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// 处理 Prisma 客户端连接
prisma.$connect().catch((error) => {
  console.error('Failed to connect to database:', error);
});

export default prisma;


