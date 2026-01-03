#!/bin/bash
set -e

# 创建数据库（如果不存在）
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- 数据库已经通过环境变量创建，这里可以添加其他初始化操作
    SELECT 'Database initialized successfully';
EOSQL