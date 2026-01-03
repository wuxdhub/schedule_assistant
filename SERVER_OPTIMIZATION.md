# 2核4G服务器部署优化指南

## 服务器配置评估

**2核4G服务器对于课表助手项目是基本够用的**，但需要进行合理的资源分配和优化。

### 资源分配方案

| 服务 | CPU限制 | 内存限制 | 内存预留 | 说明 |
|------|---------|----------|----------|------|
| PostgreSQL | 1.0核 | 1GB | 512MB | 数据库服务 |
| 后端API | 0.8核 | 1GB | 256MB | Node.js应用 |
| 前端Nginx | 0.5核 | 512MB | 128MB | 静态文件服务 |
| 系统预留 | 0.7核 | 1.5GB | - | 操作系统和其他服务 |

## 性能优化配置

### 1. PostgreSQL优化

已创建 [`postgres.conf`](postgres.conf) 配置文件，主要优化：
- `shared_buffers = 256MB` - 共享缓冲区
- `effective_cache_size = 1GB` - 缓存大小
- `max_connections = 50` - 限制连接数
- `work_mem = 8MB` - 查询内存

### 2. Node.js后端优化

在 [`docker-compose.yml`](docker-compose.yml) 中设置：
- `NODE_OPTIONS: "--max-old-space-size=512"` - 限制V8堆内存
- 内存限制1GB，CPU限制0.8核

### 3. Nginx前端优化

- 使用Alpine Linux镜像减少内存占用
- 启用Gzip压缩减少带宽使用
- 静态资源缓存优化

## 部署建议

### 构建时优化

如果构建过程卡住，可能的原因和解决方案：

1. **内存不足导致构建失败**
   ```bash
   # 增加swap空间
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

2. **分步构建减少内存压力**
   ```bash
   # 先构建后端
   docker-compose build server
   
   # 再构建前端
   docker-compose build client
   
   # 最后启动所有服务
   docker-compose up -d
   ```

3. **使用预构建镜像**
   ```bash
   # 如果本地构建困难，可以考虑使用CI/CD构建镜像
   # 然后推送到镜像仓库，服务器直接拉取
   ```

### 运行时监控

使用提供的监控脚本：
```bash
chmod +x monitor.sh
./monitor.sh
```

### 性能调优建议

1. **数据库连接池优化**
   - 限制应用程序的数据库连接数
   - 使用连接池避免频繁建立连接

2. **文件上传优化**
   - 限制上传文件大小
   - 使用流式处理大文件

3. **缓存策略**
   - 启用Nginx静态文件缓存
   - 考虑添加Redis缓存热点数据

## 扩容建议

如果2核4G不够用，建议的升级路径：

### 短期优化（不升级硬件）
1. 优化数据库查询
2. 添加应用层缓存
3. 压缩静态资源
4. 使用CDN加速

### 中期升级（小幅升级）
- **4核8G**: 可以支持更多并发用户
- 增加SSD存储提升I/O性能

### 长期扩展（大幅升级）
- **8核16G**: 支持大规模使用
- 考虑微服务架构
- 数据库读写分离

## 故障排除

### 常见问题

1. **内存不足**
   ```bash
   # 检查内存使用
   free -h
   docker stats
   
   # 重启服务释放内存
   docker-compose restart
   ```

2. **CPU使用率过高**
   ```bash
   # 检查CPU使用
   top
   docker stats
   
   # 查看具体进程
   docker exec -it schedule_server top
   ```

3. **磁盘空间不足**
   ```bash
   # 清理Docker缓存
   docker system prune -a
   
   # 清理日志文件
   docker-compose logs --tail=0 -f
   ```

### 性能基准

在2核4G服务器上的预期性能：
- **并发用户**: 20-50个
- **响应时间**: < 500ms
- **数据库查询**: < 100ms
- **文件上传**: 支持10MB以内文件

## 监控指标

需要关注的关键指标：
- CPU使用率 < 80%
- 内存使用率 < 85%
- 磁盘使用率 < 80%
- 数据库连接数 < 40
- 响应时间 < 1秒

## 备份策略

在资源有限的服务器上的备份建议：
1. 每日数据库备份
2. 定期备份上传文件
3. 配置文件版本控制
4. 使用外部存储（如对象存储）

## 总结

2核4G服务器可以运行课表助手项目，但需要：
1. 合理的资源分配
2. 适当的性能优化
3. 持续的监控和调优
4. 必要时考虑硬件升级

通过以上优化措施，可以在2核4G服务器上稳定运行课表助手系统，支持中小规模的用户使用。