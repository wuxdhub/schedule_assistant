#!/bin/bash

# 服务器资源监控脚本
# 用于监控2核4G服务器上Docker容器的资源使用情况

echo "=========================================="
echo "课表助手服务器资源监控"
echo "=========================================="

# 检查系统资源
echo "系统资源概览:"
echo "CPU核心数: $(nproc)"
echo "总内存: $(free -h | awk '/^Mem:/ {print $2}')"
echo "可用内存: $(free -h | awk '/^Mem:/ {print $7}')"
echo "磁盘使用: $(df -h / | awk 'NR==2 {print $3"/"$2" ("$5")"}')"
echo ""

# 检查Docker服务状态
echo "Docker服务状态:"
if systemctl is-active --quiet docker; then
    echo "✓ Docker服务运行正常"
else
    echo "✗ Docker服务未运行"
    exit 1
fi
echo ""

# 检查容器状态
echo "容器运行状态:"
docker-compose ps 2>/dev/null || docker compose ps 2>/dev/null
echo ""

# 检查容器资源使用
echo "容器资源使用情况:"
echo "容器名称          CPU使用率    内存使用/限制        内存百分比    网络I/O"
echo "--------------------------------------------------------------------------------"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}" 2>/dev/null

echo ""
echo "详细内存使用:"
docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}" 2>/dev/null | while read line; do
    echo "  $line"
done

echo ""
echo "系统负载:"
echo "  1分钟负载: $(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')"
echo "  5分钟负载: $(uptime | awk -F'load average:' '{print $2}' | awk '{print $2}' | sed 's/,//')"
echo "  15分钟负载: $(uptime | awk -F'load average:' '{print $2}' | awk '{print $3}')"

echo ""
echo "内存详情:"
free -h

echo ""
echo "磁盘使用详情:"
df -h

echo ""
echo "=========================================="
echo "性能建议:"

# 检查内存使用率
MEM_USAGE=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 80 ]; then
    echo "⚠️  内存使用率较高 (${MEM_USAGE}%)，建议优化"
elif [ "$MEM_USAGE" -gt 60 ]; then
    echo "⚡ 内存使用率适中 (${MEM_USAGE}%)，运行良好"
else
    echo "✓ 内存使用率正常 (${MEM_USAGE}%)"
fi

# 检查CPU负载
LOAD_1MIN=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//' | cut -d. -f1)
if [ "$LOAD_1MIN" -gt 2 ]; then
    echo "⚠️  CPU负载较高，建议检查应用性能"
else
    echo "✓ CPU负载正常"
fi

# 检查磁盘使用率
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "⚠️  磁盘使用率较高 (${DISK_USAGE}%)，建议清理"
else
    echo "✓ 磁盘使用率正常 (${DISK_USAGE}%)"
fi

echo "=========================================="