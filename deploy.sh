#!/bin/bash

# 课表助手一键部署脚本
# 使用 Docker Compose 部署前后端和数据库

set -e

echo "=========================================="
echo "课表助手 Docker 一键部署脚本"
echo "=========================================="

# 检查 Docker 和 Docker Compose 是否安装
check_dependencies() {
    echo "检查依赖..."
    
    if ! command -v docker &> /dev/null; then
        echo "错误: Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "错误: Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    echo "✓ Docker 和 Docker Compose 已安装"
}

# 检查环境变量文件
check_env_file() {
    if [ ! -f ".env" ]; then
        echo "警告: .env 文件不存在，将使用默认配置"
        echo "你可以复制 .env.example 并修改配置"
    else
        echo "✓ 找到 .env 配置文件"
    fi
}

# 停止并清理现有容器
cleanup() {
    echo "清理现有容器..."
    docker-compose down --remove-orphans 2>/dev/null || docker compose down --remove-orphans 2>/dev/null || true
    echo "✓ 清理完成"
}

# 构建和启动服务
deploy() {
    echo "开始构建和部署服务..."
    
    # 构建镜像
    echo "构建 Docker 镜像..."
    if command -v docker-compose &> /dev/null; then
        docker-compose build --no-cache
    else
        docker compose build --no-cache
    fi
    
    # 启动服务
    echo "启动服务..."
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    echo "✓ 服务启动完成"
}

# 等待服务就绪
wait_for_services() {
    echo "等待服务启动..."
    
    # 等待数据库就绪
    echo "等待数据库启动..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker exec schedule_postgres pg_isready -U postgres -d zhinengpaike &>/dev/null; then
            echo "✓ 数据库已就绪"
            break
        fi
        sleep 2
        timeout=$((timeout-2))
    done
    
    if [ $timeout -le 0 ]; then
        echo "错误: 数据库启动超时"
        exit 1
    fi
    
    # 运行数据库迁移
    echo "运行数据库迁移..."
    docker exec schedule_server npx prisma migrate deploy || true
    docker exec schedule_server npx prisma db push || true
    echo "✓ 数据库迁移完成"
    
    # 等待后端服务就绪
    echo "等待后端服务启动..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -f http://localhost:3001/health &>/dev/null; then
            echo "✓ 后端服务已就绪"
            break
        fi
        sleep 2
        timeout=$((timeout-2))
    done
    
    # 等待前端服务就绪
    echo "等待前端服务启动..."
    timeout=30
    while [ $timeout -gt 0 ]; do
        if curl -f http://localhost:3000 &>/dev/null; then
            echo "✓ 前端服务已就绪"
            break
        fi
        sleep 2
        timeout=$((timeout-2))
    done
}

# 显示部署结果
show_result() {
    echo ""
    echo "=========================================="
    echo "部署完成！"
    echo "=========================================="
    echo ""
    echo "服务访问地址："
    echo "  前端应用: http://localhost:3000"
    echo "  后端API:  http://localhost:3001"
    echo "  数据库:   localhost:5432"
    echo ""
    echo "管理命令："
    echo "  查看日志: docker-compose logs -f"
    echo "  停止服务: docker-compose down"
    echo "  重启服务: docker-compose restart"
    echo "  查看状态: docker-compose ps"
    echo ""
    echo "数据库连接信息："
    echo "  主机: localhost"
    echo "  端口: 5432"
    echo "  数据库: zhinengpaike"
    echo "  用户名: postgres"
    echo "  密码: 123456 (可在 .env 文件中修改)"
    echo ""
}

# 主函数
main() {
    check_dependencies
    check_env_file
    cleanup
    deploy
    wait_for_services
    show_result
}

# 处理中断信号
trap 'echo "部署被中断"; exit 1' INT TERM

# 执行主函数
main "$@"