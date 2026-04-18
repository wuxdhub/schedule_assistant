# 机房课表助手

## 项目简介

高校教务处机房课表助手，支持Excel导入、智能查询、预约管理、冲突检测和课表导出等功能。

## 技术栈

### 后端
- Node.js + Express + TypeScript
- PostgreSQL（数据库）
- xlsx（Excel处理）
- Prisma（ORM）

### 前端
- React + TypeScript
- Ant Design（UI组件库）
- Axios（HTTP请求）
- dayjs（日期处理）

## 项目结构

```
zhinengpaike/
├── server/          # 后端服务
│   ├── src/
│   │   ├── routes/  # 路由
│   │   ├── controllers/ # 控制器
│   │   ├── models/  # 数据模型
│   │   ├── services/ # 业务逻辑
│   │   └── utils/   # 工具函数
│   └── prisma/      # 数据库模型和迁移
├── client/          # 前端应用
│   ├── src/
│   │   ├── components/ # 组件
│   │   ├── pages/   # 页面
│   │   ├── services/ # API服务
│   │   └── utils/   # 工具函数
└── README.md
```

## 系统运行指南

### 前提条件

确保已安装：
- ✅ Node.js >= 18.0.0
- ✅ PostgreSQL >= 12.0
- ✅ 已安装所有依赖（`npm run install:all`）

---

### 第一步：检查数据库配置

#### 1.1 检查数据库连接

确保 `server/.env` 文件存在且配置正确：

```env
DATABASE_URL="postgresql://用户名:密码@localhost:5432/schedule_db?schema=public"
CORS_ORIGIN=http://localhost:3000
```

#### 1.2 确保数据库已创建

如果还没有创建数据库，运行：

```sql
CREATE DATABASE zhinengpaike;
```

---

### 第二步：初始化数据库（首次运行）

如果是第一次运行，需要：

#### 2.1 运行数据库迁移

```bash
cd server
npx prisma migrate dev
npx prisma generate
```

#### 2.2 初始化管理员账号

```bash
cd server
npm run reset:users
```

这会创建：
- 管理员：用户名 `admin`，密码 `admin123`

---

### 第三步：启动服务器

#### 方法A：同时启动前后端（推荐）

**打开一个终端窗口**，在项目根目录运行：

```bash
npm run dev
```

这会同时启动：
- 后端服务器：http://localhost:3001
- 前端应用：http://localhost:3000

#### 方法B：分别启动（便于查看日志）

**打开第一个终端窗口**（后端）：

```bash
npm run dev:server
```

等待看到：
```
🚀 Server running on http://localhost:3001
```

**打开第二个终端窗口**（前端）：

```bash
npm run dev:client
```

等待看到：
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:3000/
```

---

### 第四步：访问系统

#### 4.1 打开浏览器

访问：http://localhost:3000

#### 4.2 选择用户类型

你会看到登录页面，有两个选项：

##### 选项1：普通用户（无需登录）
1. 选择 **"普通用户"** 按钮（左侧）
2. 点击 **"进入系统（普通用户）"** 按钮
3. 直接进入系统

**功能**：
- ✅ 查看课表管理
- ✅ 查询空闲机房（但不能预约）
- ✅ 按周次导出课表

##### 选项2：管理员（需要登录）
1. 选择 **"管理员"** 按钮（右侧）
2. 输入用户名：`admin`
3. 输入密码：`admin123`
4. 点击 **"管理员登录"** 按钮

**功能**：
- ✅ 查看课表管理
- ✅ 查询空闲机房（可以预约）
- ✅ 数据导入
- ✅ 导出课表

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

应该看到登录页面。


### 快速命令总结

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

# 3. 访问系统
# 浏览器打开：http://localhost:3000
```

---

### 停止系统

在运行 `npm run dev` 的终端窗口中按 `Ctrl+C` 停止。

如果分别启动的，需要在每个终端窗口中按 `Ctrl+C`。


