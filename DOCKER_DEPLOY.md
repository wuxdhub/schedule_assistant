# 课表助手 Docker 部署指南

本项目提供了完整的 Docker Compose 一键部署方案，包括前端、后端和数据库服务。

## 系统要求

- Docker 20.10+
- Docker Compose 2.0+ 或 docker-compose 1.29+
- 至少 2GB 可用内存
- 至少 5GB 可用磁盘空间

## 快速部署

### Linux/macOS

```bash
# 给部署脚本执行权限
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

### Windows

```cmd
# 直接运行批处理文件
deploy.bat
```

## 手动部署

如果自动部署脚本遇到问题，可以手动执行以下步骤：

```bash
# 1. 构建镜像
docker-compose build

# 2. 启动服务
docker-compose up -d

# 3. 等待数据库启动后运行迁移
docker exec schedule_server npx prisma migrate deploy
docker exec schedule_server npx prisma db push
```

## 服务访问

部署完成后，可以通过以下地址访问服务：

- **前端应用**: http://localhost:3000
- **后端API**: http://localhost:3001
- **数据库**: localhost:5432

## 配置说明

### 环境变量

复制并修改 `.env` 文件来自定义配置：

```bash
# 数据库密码
DB_PASSWORD=123456

# 微信通知配置（可选）
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your-webhook-key

# 运行环境
NODE_ENV=production
```

### 端口配置

默认端口配置：
- 前端: 3000
- 后端: 3001
- 数据库: 5432

如需修改端口，请编辑 `docker-compose.yml` 文件中的 `ports` 配置。

## 管理命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f postgres

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 停止服务并删除数据卷（注意：会删除数据库数据）
docker-compose down -v

# 重新构建并启动
docker-compose up --build -d
```

## 数据管理

### 数据备份

```bash
# 备份数据库
docker exec schedule_postgres pg_dump -U postgres zhinengpaike > backup.sql

# 备份上传文件
docker cp schedule_server:/app/uploads ./uploads_backup
```

### 数据恢复

```bash
# 恢复数据库
docker exec -i schedule_postgres psql -U postgres zhinengpaike < backup.sql

# 恢复上传文件
docker cp ./uploads_backup schedule_server:/app/uploads
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 检查端口占用
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :3001
   netstat -tulpn | grep :5432
   
   # 修改 docker-compose.yml 中的端口映射
   ```

2. **数据库连接失败**
   ```bash
   # 检查数据库容器状态
   docker-compose logs postgres
   
   # 重启数据库服务
   docker-compose restart postgres
   ```

3. **前端无法访问后端**
   ```bash
   # 检查网络连接
   docker network ls
   docker network inspect schedule_assistant_schedule_network
   ```

4. **构建失败**
   ```bash
   # 清理 Docker 缓存
   docker system prune -a
   
   # 重新构建
   docker-compose build --no-cache
   ```

### 日志分析

```bash
# 查看所有服务日志
docker-compose logs

# 实时查看日志
docker-compose logs -f --tail=100

# 查看特定时间段的日志
docker-compose logs --since="2024-01-01T00:00:00" --until="2024-01-01T23:59:59"
```

## 性能优化

### 生产环境建议

1. **资源限制**
   ```yaml
   # 在 docker-compose.yml 中添加资源限制
   deploy:
     resources:
       limits:
         memory: 512M
         cpus: '0.5'
   ```

2. **数据卷优化**
   ```bash
   # 使用命名卷而不是绑定挂载
   volumes:
     postgres_data:
       driver: local
       driver_opts:
         type: none
         o: bind
         device: /opt/schedule_data
   ```

3. **网络优化**
   ```yaml
   # 使用自定义网络
   networks:
     schedule_network:
       driver: bridge
       ipam:
         config:
           - subnet: 172.20.0.0/16
   ```

## 安全建议

1. **修改默认密码**
   - 修改 `.env` 文件中的 `DB_PASSWORD`
   - 重新部署服务

2. **网络安全**
   - 生产环境中不要暴露数据库端口
   - 使用反向代理（如 Nginx）
   - 配置 HTTPS

3. **数据安全**
   - 定期备份数据
   - 限制文件上传大小
   - 验证上传文件类型

## 更新升级

```bash
# 1. 备份数据
./backup.sh

# 2. 拉取最新代码
git pull

# 3. 重新构建并部署
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 4. 运行数据库迁移（如有需要）
docker exec schedule_server npx prisma migrate deploy
```

## 技术支持

如果遇到问题，请：

1. 查看日志文件
2. 检查系统资源使用情况
3. 确认网络连接正常
4. 提交 Issue 并附上相关日志