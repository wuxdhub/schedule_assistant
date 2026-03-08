#!/bin/bash

# 课表助手一键部署脚本
# 适用于 Windows 11 + Docker Desktop 环境

set -e

echo "=========================================="
echo "课表助手 Docker 一键部署脚本"
echo "=========================================="

# 统一使用 docker compose (新版语法)
DOCKER_COMPOSE="docker compose"

# 检查 Docker 是否安装并运行
check_dependencies() {
    echo "检查依赖..."

    if ! command -v docker &> /dev/null; then
        echo "错误: Docker 未安装，请先安装 Docker Desktop"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "错误: Docker 未运行，请先启动 Docker Desktop"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        echo "错误: docker compose 插件未安装，请升级 Docker Desktop"
        exit 1
    fi

    echo "✓ Docker 和 Docker Compose 已就绪"
}

# 检查环境变量文件
check_env_file() {
    if [ -f "server/.env" ]; then
        cp server/.env .env
        echo "✓ 已从 server/.env 复制生成 .env"
    elif [ ! -f ".env" ]; then
        echo "错误: server/.env 不存在"
        exit 1
    fi
}

# 停止并清理现有容器
cleanup() {
    echo "清理现有容器..."
    $DOCKER_COMPOSE down --remove-orphans 2>/dev/null || true
    echo "✓ 清理完成"
}

# 构建和启动服务
deploy() {
    echo "构建 Docker 镜像（首次构建较慢，请耐心等待）..."
    $DOCKER_COMPOSE build

    echo "启动服务..."
    $DOCKER_COMPOSE up -d

    echo "✓ 服务已启动"
}

# 等待数据库就绪
wait_for_db() {
    echo "等待数据库启动..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker exec schedule_postgres pg_isready -U postgres -d zhinengpaike &>/dev/null; then
            echo "✓ 数据库已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  等待中... ($attempt/$max_attempts)"
        sleep 2
    done

    echo "错误: 数据库启动超时，请检查日志: docker compose logs postgres"
    exit 1
}

# 运行数据库迁移
run_migrations() {
    echo "运行数据库迁移..."
    # 优先使用 migrate deploy（生产环境推荐），失败则回退到 db push
    if docker exec schedule_server npx prisma migrate deploy 2>/dev/null; then
        echo "✓ 数据库迁移完成 (migrate deploy)"
    else
        echo "migrate deploy 失败，尝试 db push..."
        docker exec schedule_server npx prisma db push --accept-data-loss
        echo "✓ 数据库迁移完成 (db push)"
    fi
}

# 等待后端服务就绪
wait_for_server() {
    echo "等待后端服务启动..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker exec schedule_server wget --no-verbose --tries=1 --spider http://localhost:3001/api/health &>/dev/null; then
            echo "✓ 后端服务已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  等待中... ($attempt/$max_attempts)"
        sleep 2
    done

    echo "警告: 后端服务未能在预期时间内就绪，请检查日志: docker compose logs server"
}

# 等待前端服务就绪
wait_for_client() {
    echo "等待前端服务启动..."
    local max_attempts=15
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker exec schedule_client wget --no-verbose --tries=1 --spider http://localhost:80 &>/dev/null; then
            echo "✓ 前端服务已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        echo "  等待中... ($attempt/$max_attempts)"
        sleep 2
    done

    echo "警告: 前端服务未能在预期时间内就绪，请检查日志: docker compose logs client"
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
    echo "常用管理命令："
    echo "  查看日志: docker compose logs -f"
    echo "  停止服务: docker compose down"
    echo "  重启服务: docker compose restart"
    echo "  查看状态: docker compose ps"
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
    wait_for_db
    run_migrations
    wait_for_server
    wait_for_client
    show_result
}

trap 'echo ""; echo "部署被中断"; exit 1' INT TERM

main "$@"
