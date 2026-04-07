import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRoutes from './routes/upload';
import queryRoutes from './routes/query';
import scheduleRoutes from './routes/schedule';
import exportRoutes from './routes/export';
import authRoutes from './routes/auth';
import semesterRoutes from './routes/semester';
import scheduleVersionRoutes from './routes/scheduleVersion';
import prisma from './lib/prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/semester', semesterRoutes);
app.use('/api/schedule-version', scheduleVersionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/export', exportRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// 优雅关闭
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});


