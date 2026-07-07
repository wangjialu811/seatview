# SeatView

SeatView 是一个演唱会视角查询平台，基于项目计划书搭建，目标是帮助用户在购票前查看场馆、座位图和真实座区视角。

## 当前版本

- 场馆和城市搜索
- 热门场馆列表
- 场馆详情
- 热门城市
- 最近更新
- 场馆详情、座位图、座区和视角卡片
- 独立后台页面：`admin.html`
- Dashboard、场馆管理、座位图管理、座区管理、视角记录管理
- 标签由管理员勾选，MVP 不使用 AI
- 后台录入数据会保存到 `data/db.json`

## 使用方式

启动本地服务：

```bash
npm start
```

前台：

```text
http://127.0.0.1:5178/
```

后台：

```text
http://127.0.0.1:5178/admin.html
```

## 后续可升级方向

- 迁移为 Next.js + TypeScript + TailwindCSS
- 接入 NestJS、PostgreSQL、Prisma
- 增加真实 UGC 投稿、收藏和浏览记录
- 接入对象存储保存图片与视频截图
- 增加场馆座位图上传和座区标注
- 增加 AI 自动标签生成和视角预测
