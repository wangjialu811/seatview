# SeatView · AI 演唱会座区决策平台 MVP

在原生 HTML/CSS/JavaScript + Node HTTP + JSON 数据文件项目上增量升级，保留原有搜索、场馆管理、座位图上传、座区和视角增删改、密码登录。

## 启动

需要 Node.js 18.17+，无第三方依赖。前后端由同一个服务启动，无须两个终端。

```powershell
Copy-Item .env.example .env
npm start
```

前台 http://127.0.0.1:5178/ ，后台 http://127.0.0.1:5178/admin.html 。如果没有设置 ADMIN_PASSWORD，默认密码为 seatview-admin；复制示例后密码为 change-this-password，请以自己的 .env 为准。环境变量优先于 .env，修改后重启服务。端口占用时修改 PORT，或在原服务终端 Ctrl+C 后重新启动。

## AI 配置

`.env.example` 列出全部字段：

|字段|作用|
|---|---|
|PORT|服务端口，默认5178|
|HOST|监听地址，默认0.0.0.0|
|ADMIN_PASSWORD|后台密码|
|DATA_DIR|数据目录，默认./data|
|OPENAI_API_KEY|真实大模型 Key，仅后端读取，可为空|
|OPENAI_BASE_URL|OpenAI 兼容接口根地址，默认 https://api.openai.com/v1|
|OPENAI_MODEL|支持 JSON object 输出的模型，默认 gpt-4o-mini|
|AI_MODE|auto：无Key自动Mock，有Key调用模型；mock：强制本地规则|

真实模式：填写 OPENAI_API_KEY，AI_MODE=auto。请求或 JSON 校验失败会明确提示并降级到本地规则，按钮可重新发起。Mock 模式不联网、不收费。`.env` 已忽略，静态服务禁止读取环境文件、服务源码与数据库文件。

## 面试演示（约3分钟）

1. 首页搜索“南京”，进入南京奥林匹克体育中心体育场。
2. 展示示意座位图与 A3/A5/B1/C2/D4 五个座区卡片（图与评价明确为 Demo）。
3. 输入“想离延伸台近一点，主要想拍直拍，希望无遮挡”，点击帮我选座，Mock 首选 A3。
4. 改为“我不拍照，只想正面看舞台”，Mock 首选 B1。
5. 进入后台 → 视角记录管理 → AI 智能录入，粘贴“南京奥体中心体育场 A3 区，离主舞台挺近，但是只能看侧面，前面没有明显遮挡，手机拍摄还可以。”
6. 点击 AI 解析，展示置信度、未知字段和可编辑预览。修改总结/来源，可上传自己的视角图片。
7. 点击确认保存，点击查看该场馆详情；新记录立即展示。已有前台标签页重新获得焦点时也会刷新。

## 核心实现

- Demo：复用已有南京场馆，补充一个自绘示意座位图、五张自绘视角插画、五个座区与结构化记录。保留鸟巢和青岛数据。浏览器验收另保留一条明确标注 Demo 的 A3 人工确认评价。
- 智能录入：POST /api/ai/extract（需登录）调用服务封装，严格验证 JSON。预览不写数据库；POST /api/ai/records（需登录）在服务端确认已有场馆，复用或创建座区，映射为原 viewRecords 字段并同时保留新字段，状态为已发布。
- 推荐：POST /api/ai/recommend 不要求登录，后端读取当前场馆已发布记录，按座区去重。解析偏好 → 按已有字段比较候选（最多12个）→ 模型选记录 → 校验记录ID、数量、评分 → 从已有字段拼装理由、不足与来源。空数据显示不足，单座区不生成备选。
- Prompt：services/prompts.js；模型封装：services/aiService.js；环境加载：services/env.js；页面交互：ai-ui.js。使用 Chat Completions JSON object 输出，超时30秒。
- 原有视角编辑增加四个结构化输入，保留已有额外字段、自定义标签和创建时间；新旧字段兼容，旧数据缺失信息显示待补充。
- Loading 与防重复：AI按钮请求期间禁用；原有异步保存表单也防止重复提交；跨场馆切换时丢弃旧场馆的推荐结果。

## 验证与限制

运行 `npm test`。测试使用临时数据副本和独立5181端口，不修改正式数据。详见 DEMO_REPORT.md。

真实API未配置Key，因此未进行付费在线验收；网络/错误JSON降级通过模拟模型响应验证。Mock为简单规则，不能完整理解复杂否定和多段描述，需要人工确认。真实推荐仍使用后端提供的字段理由，避免展示模型编造的解释。

南京图片是示意插画而非真实照片，座区按钮不是精确地图坐标，分区/舞台布局仅为示例。票价、实时票务、支付、爬虫、复杂RAG、模型训练、多管理员体系不在本次范围。JSON整库保存适合单运营Demo，多管理员同时写入可能覆盖；会话在内存中，服务重启后需重新登录，上传图片仍保存在JSON中。

## OpenRouter 配置

支持 OPENROUTER_BASE_URL / OPENROUTER_MODEL / OPENROUTER_API_KEY。出现任一 OpenRouter 配置时优先使用 OpenRouter；其 Key 也可以沿用已有 OPENAI_API_KEY。

```dotenv
OPENROUTER_API_KEY=你的Key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=inclusionai/ling-3.1-flash
AI_MODE=auto
```

修改环境变量后重启服务。降级提示现在区分HTTP鉴权/余额/限流、超时、连接问题和JSON字段校验失败；不会输出Key或上游响应正文。部分提供商明确拒绝JSON模式时，自动移除response_format重试并继续验证返回JSON与已有座区约束。

后端代理：可设置 `AI_PROXY_URL=http://127.0.0.1:7897`（填写实际HTTP代理端口），也支持HTTPS_PROXY/HTTP_PROXY。Node 18不会自动继承浏览器代理。代理实现使用内置HTTP CONNECT，保留TLS证书验证，无新增依赖。Ling 3.1 Flash不发送不支持的response_format，并关闭推理模式以降低简短JSON输出被思考token耗尽的概率；仍验证JSON和推荐范围。

## 首页搜索与详情 UI 优化

首页默认顺序为产品介绍/搜索、热门城市、热门场馆、轻量统计、辅助内容。输入时160ms防抖，搜索结果直接出现在输入框下面，热门与辅助内容暂时隐藏；清空恢复。查询按钮与Enter立即执行，热门城市点击后填入并展示结果。四条以上可展开全部。搜索只读取现有数据，不调用AI。

点击结果进入同一应用的独立详情视图（/?venue=ID#viewer），首页区域隐藏，刷新和浏览器前进/返回可恢复。顶部简短场馆信息及AI入口；桌面座位图与AI输入并排，移动端上下；下方多列视角卡片及推荐结果。旧的后台场馆直达链接继续可用。详情返回保留搜索词。热门场馆默认展示6条，可展开，缺失isHot字段的旧数据继续显示。

搜索匹配模块为assets/venue-search.js，支持城市/名称、现有aliases、中文有序模糊匹配、奥林匹克/奥体简称、空格和大小写归一化。使用普通文档流结果列表，不做悬浮下拉，结果支持原生Tab和Enter操作。验收记录和截图见UI_REPORT.md。
