# SeatView 部署说明

## 当前项目结构

SeatView 现在是一个 Node.js 网站：

- 前台：`/`
- 后台：`/admin.html`
- 后台登录：`/login.html`
- 数据接口：`/api/state`
- 数据文件：默认保存在 `data/db.json`

前台所有人都能访问。后台和保存数据接口需要管理员密码。

## 本地启动

```bash
npm start
```

打开：

- 前台：http://127.0.0.1:5178/
- 后台：http://127.0.0.1:5178/admin.html

默认后台密码是：

```text
seatview-admin
```

正式部署时一定要改成自己的密码。

## 环境变量

部署平台里建议配置：

```text
PORT=5178
HOST=0.0.0.0
ADMIN_PASSWORD=你的后台密码
DATA_DIR=./data
```

如果平台自动分配端口，可以不填 `PORT`，项目会读取平台提供的端口。

## 推荐部署方式

### 方案 A：Render / Railway

适合 MVP 演示，操作简单。

配置：

- Build Command：不需要，留空即可
- Start Command：`npm start`
- Environment Variables：
  - `ADMIN_PASSWORD`
  - `HOST=0.0.0.0`

注意：如果平台没有持久磁盘，重新部署后 `data/db.json` 可能会丢失。需要开 Persistent Disk，或后续换成真正数据库。

### 方案 B：云服务器

适合长期稳定运行。

需要：

- 一台云服务器
- 安装 Node.js
- 上传项目文件
- 配置域名和 HTTPS
- 用进程管理工具保持服务运行

启动：

```bash
npm start
```

然后把域名反向代理到项目端口。

## 上线前检查

- 已设置 `ADMIN_PASSWORD`
- 后台访问会跳转到登录页
- 前台可以不登录访问
- 后台新增/编辑/删除数据后，前台能同步展示
- 数据目录 `DATA_DIR` 是持久保存的

## 后续更正式的版本

现在图片会以数据形式存在 `db.json` 里，适合 MVP 和演示。

如果后续数据量变大，建议升级为：

- 数据库：PostgreSQL / MySQL / SQLite
- 图片存储：阿里云 OSS / 腾讯云 COS / Cloudflare R2
- 后台账号：多管理员账号和权限
