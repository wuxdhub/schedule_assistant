@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo 课表助手 Docker 一键部署脚本 (Windows)
echo ==========================================

:: 检查 Docker 和 Docker Compose 是否安装
echo 检查依赖...

docker --version >nul 2>&1
if errorlevel 1 (
    echo 错误: Docker 未安装，请先安装 Docker Desktop
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo 错误: Docker Compose 未安装，请先安装 Docker Compose
        pause
        exit /b 1
    )
)

echo ✓ Docker 和 Docker Compose 已安装

:: 检查环境变量文件
if not exist ".env" (
    echo 警告: .env 文件不存在，将使用默认配置
    echo 你可以复制 .env.example 并修改配置
) else (
    echo ✓ 找到 .env 配置文件
)

:: 停止并清理现有容器
echo 清理现有容器...
docker-compose down --remove-orphans 2>nul || docker compose down --remove-orphans 2>nul
echo ✓ 清理完成

:: 构建和启动服务
echo 开始构建和部署服务...

:: 构建镜像
echo 构建 Docker 镜像...
docker-compose build --no-cache 2>nul
if errorlevel 1 (
    docker compose build --no-cache
    if errorlevel 1 (
        echo 错误: 镜像构建失败
        pause
        exit /b 1
    )
)

:: 启动服务
echo 启动服务...
docker-compose up -d 2>nul
if errorlevel 1 (
    docker compose up -d
    if errorlevel 1 (
        echo 错误: 服务启动失败
        pause
        exit /b 1
    )
)

echo ✓ 服务启动完成

:: 等待服务就绪
echo 等待服务启动...

:: 等待数据库就绪
echo 等待数据库启动...
set /a timeout=60
:wait_db
docker exec schedule_postgres pg_isready -U postgres -d zhinengpaike >nul 2>&1
if not errorlevel 1 (
    echo ✓ 数据库已就绪
    goto db_ready
)
timeout /t 2 /nobreak >nul
set /a timeout=timeout-2
if !timeout! gtr 0 goto wait_db

echo 错误: 数据库启动超时
pause
exit /b 1

:db_ready
:: 运行数据库迁移
echo 运行数据库迁移...
docker exec schedule_server npx prisma migrate deploy 2>nul
docker exec schedule_server npx prisma db push 2>nul
echo ✓ 数据库迁移完成

:: 等待后端服务就绪
echo 等待后端服务启动...
set /a timeout=60
:wait_server
curl -f http://localhost:3001/health >nul 2>&1
if not errorlevel 1 (
    echo ✓ 后端服务已就绪
    goto server_ready
)
timeout /t 2 /nobreak >nul
set /a timeout=timeout-2
if !timeout! gtr 0 goto wait_server

:server_ready
:: 等待前端服务就绪
echo 等待前端服务启动...
set /a timeout=30
:wait_client
curl -f http://localhost:3000 >nul 2>&1
if not errorlevel 1 (
    echo ✓ 前端服务已就绪
    goto client_ready
)
timeout /t 2 /nobreak >nul
set /a timeout=timeout-2
if !timeout! gtr 0 goto wait_client

:client_ready
:: 显示部署结果
echo.
echo ==========================================
echo 部署完成！
echo ==========================================
echo.
echo 服务访问地址：
echo   前端应用: http://localhost:3000
echo   后端API:  http://localhost:3001
echo   数据库:   localhost:5432
echo.
echo 管理命令：
echo   查看日志: docker-compose logs -f
echo   停止服务: docker-compose down
echo   重启服务: docker-compose restart
echo   查看状态: docker-compose ps
echo.
echo 数据库连接信息：
echo   主机: localhost
echo   端口: 5432
echo   数据库: zhinengpaike
echo   用户名: postgres
echo   密码: 123456 (可在 .env 文件中修改)
echo.

pause