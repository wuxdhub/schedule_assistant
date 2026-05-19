# 机房课表助手

## 项目简介

高校教务处机房课表助手，支持Excel导入、智能查询、预约管理、冲突检测、课表导出（Excel/PDF/PNG）、版本管理、数据同步等功能。

## 技术栈

### 后端
- Node.js + Express + TypeScript
- PostgreSQL（数据库）
- xlsx / ExcelJS（Excel处理）
- Prisma（ORM）
- Canvas（图片生成）

### 前端
- React + TypeScript
- Ant Design（UI组件库）
- Axios（HTTP请求）
- dayjs（日期处理）

### 部署
- Docker & Docker Compose

## 项目结构

```
schedule_assistant/
├── server/          # 后端服务
│   ├── src/
│   │   ├── routes/  # 路由
│   │   │   ├── auth.ts
│   │   │   ├── export.ts      # 课表导出接口
│   │   │   ├── query.ts       # 查询接口
│   │   │   ├── upload.ts      # Excel导入接口
│   │   │   ├── schedule.ts    # 课表管理接口
│   │   │   ├── semester.ts    # 学期管理接口
│   │   │   └── reminder.ts    # 定时提醒接口
│   │   ├── controllers/ # 控制器
│   │   ├── models/  # 数据模型
│   │   ├── services/ # 业务逻辑
│   │   └── utils/   # 工具函数
│   └── prisma/      # 数据库模型和迁移
├── client/          # 前端应用
│   ├── src/
│   │   ├── components/ # 组件
│   │   │   └── AppHeader.tsx  # 顶部导航 & 侧边栏
│   │   ├── pages/   # 页面
│   │   ├── services/ # API服务
│   │   └── utils/   # 工具函数
├── docker-compose.yml   # Docker Compose 配置
├── server/.env          # 后端环境变量（需手动创建）
└── README.md
```

## 系统运行指南

### 前提条件

确保已安装：
- ✅ Node.js >= 18.0.0
- ✅ PostgreSQL >= 12.0

### 方法一：Docker 部署（推荐）

1. 创建后端环境变量文件：

```bash
# 创建 server/.env 文件
DB_PASSWORD=your_secure_password
```

2. 启动所有服务：

```bash
docker-compose up -d
```

3. 访问系统：

- 前端：http://localhost:3000
- 后端API：http://localhost:3001
- 数据库：localhost:5432

4. 初始化数据库（首次运行）：

```bash
# 进入容器执行
cd server
npx prisma migrate dev
npx prisma generate
npm run reset:users
```

5. 停止服务：

```bash
docker-compose down
```

### 方法二：本地开发部署

#### 第一步：检查数据库配置

确保 `server/.env` 文件存在且配置正确：

```env
DATABASE_URL="postgresql://用户名:密码@localhost:5432/schedule_db?schema=public"
CORS_ORIGIN=http://localhost:3000
```

#### 第二步：安装依赖

```bash
# 项目根目录
npm run install:all
```

或分别安装：

```bash
cd server && npm install
cd ../client && npm install
```

#### 第三步：初始化数据库（首次运行）

运行数据库迁移：

```bash
cd server
npx prisma migrate dev
npx prisma generate
```

初始化管理员账号：

```bash
cd server
npm run reset:users
```

这会创建：
- 管理员：用户名 `admin`，密码 `Jisuan@2026`

#### 第四步：启动系统

**方法A：同时启动前后端（推荐）**

打开一个终端窗口，在项目根目录运行：

```bash
npm run dev
```

这会同时启动：
- 后端服务器：http://localhost:3001
- 前端应用：http://localhost:3000

**方法B：分别启动（便于查看日志）**

打开第一个终端窗口（后端）：

```bash
npm run dev:server
```

等待看到：
```
🚀 Server running on http://localhost:3001
```

打开第二个终端窗口（前端）：

```bash
npm run dev:client
```

等待看到：
```
VITE v5.x.x  ready in xxx ms
➤  Local:   http://localhost:3000/
```

---

### 第五步：访问系统

打开浏览器访问：http://localhost:3000

#### 用户类型选择

##### 选项1：普通用户（无需登录）

1. 选择 **"普通用户"** 按钮（左侧）
2. 点击 **"进入系统（普通用户）"** 按钮
3. 直接进入系统

**功能**：
- ✅ 查看课表管理
- ✅ 查询空闲机房
- ✅ 按周次导出课表（Excel）
- ✅ 查看按周次高亮课表
- ✅ 生成单日课表图片

##### 选项2：管理员（需要登录）

1. 选择 **"管理员"** 按钮（右侧）
2. 输入用户名：`admin`
3. 输入密码：`Jisuan@2026`
4. 点击 **"管理员登录"** 按钮

**功能**：
- ✅ 查看课表管理
- ✅ 查询空闲机房（带预约功能）
- ✅ 数据导入（Excel）
- ✅ 导出完整课表
- ✅ 导出原始导入文件
- ✅ 课程预约管理
- ✅ 学期管理
- ✅ 课表版本管理
- ✅ 定时提醒设置
- ✅ 课表管理

---

### 验证系统运行

#### 检查后端

访问：http://localhost:3001/api/health

应该看到：
```json
{"status":"ok","timestamp":"2024-..."}
```

#### 检查前端

访问：http://localhost:3000

应该看到登录页面或用户选择页面。

---

## API 接口文档

### 导出相关接口

#### 1. 导出完整课表（管理员）
```
GET /api/export/excel
```
导出完整课表为Excel文件（按机房分sheet）

#### 2. 导出原始导入文件（管理员）
```
GET /api/export/original
```
下载最近一次导入的原始Excel文件

#### 3. 按周次导出课表（普通用户可用）
```
GET /api/export/excel-by-week?week=1-30
```
导出指定周次的课表

#### 4. 按机房高亮导出
```
GET /api/export/highlight-by-week/room?week=1-30
```
按机房视角高亮指定周次课程

#### 5. 按星期高亮导出
```
GET /api/export/highlight-by-week/weekday?week=1-30
```
按星期视角高亮指定周次课程

#### 6. 生成单日课表图片
```
GET /api/export/daily-schedule?week=1-30&dayOfWeek=1-7
```
生成指定周次和星期几的单日课表PNG图片

#### 7. 获取课表JSON数据
```
GET /api/export/timetable-json
```
返回合并后的完整课表JSON数据

#### 8. 获取版本信息
```
GET /api/export/timetable-info
```
返回当前最新版本和学期信息

---

## 快速命令总结

```bash
# 1. 初始化数据库（首次运行）
cd server
npx prisma migrate dev
npx prisma generate
npm run reset:users

# 2. 启动系统（项目根目录）
npm run dev

# 或者分别启动：
# 终端1：npm run dev:server
# 终端2：npm run dev:client

# 3. Docker部署
docker-compose up -d

# 4. 访问系统
# 浏览器打开：http://localhost:3000
```

---

### 停止系统

在运行 `npm run dev` 的终端窗口中按 `Ctrl+C` 停止。

如果分别启动的，需要在每个终端窗口中按 `Ctrl+C`。

Docker部署使用：

```bash
docker-compose down
```

---

## 功能特性

### 数据导入
- ✅ Excel格式课表数据批量导入
- ✅ 自动识别课程信息（课程名、教师、班级、周次、节次）
- ✅ 多版本管理（支持历史版本保留和切换）

### 课表查询
- ✅ 按机房查询空闲时间
- ✅ 按教师/班级查询课程安排
- ✅ 按周次筛选显示
- ✅ 课程冲突检测

### 预约管理
- ✅ 管理员可进行课程预约
- ✅ 冲突检测避免重复预约
- ✅ 预约状态跟踪

### 课表导出
- ✅ 完整课表导出（Excel）
- ✅ 按周次导出（Excel）
- ✅ 高亮课表导出（按机房/按星期）
- ✅ 单日课表图片导出（PNG）
- ✅ JSON格式数据导出

### 版本管理
- ✅ 多版本课表数据管理
- ✅ 版本切换和激活
- ✅ 版本历史记录

### 定时任务
- ✅ 自动提醒设置
- ✅ 定时任务管理
- ✅ 执行日志记录

---

## 环境要求

| 组件 | 最低版本 | 推荐版本 |
|------|---------|---------|
| Node.js | 18.0.0 | 20.x |
| PostgreSQL | 12.0 | 15.x |
| npm | 9.0.0 | 10.x |
| Docker | 20.10.0 | 24.x |

## 开发脚本

### 根目录
- `npm run dev` - 同时启动前后端开发服务器
- `npm run dev:server` - 启动后端开发服务器
- `npm run dev:client` - 启动前端开发服务器
- `npm run build` - 构建前后端生产版本
- `npm run build:server` - 构建后端生产版本
- `npm run build:client` - 构建前端生产版本
- `npm run install:all` - 安装所有依赖

### 后端目录 (server/)
- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run start` - 启动生产服务器
- `npm run reset:users` - 重置用户数据
- `npx prisma migrate dev` - 数据库迁移开发
- `npx prisma generate` - 生成Prisma客户端

### 前端目录 (client/)
- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run preview` - 预览生产版本

---

## 注意事项

1. **数据库安全**：生产环境请修改默认密码
2. **端口占用**：确保 3000、3001、5432 端口未被占用
3. **文件权限**：Docker部署时注意文件读写权限
4. **内存限制**：Docker部署已设置内存限制，如需调整请修改 `docker-compose.yml`
5. **数据备份**：定期备份PostgreSQL数据卷

---

## 许可证

MIT License

---

## 支持

如有问题或建议，请提交 Issue 或联系项目维护者。