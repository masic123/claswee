# 课表截图识别

小程序入口：同步 → 课表截图导入。用户选择一张图片，云端识别后可编辑所有时段、名称、教室、教师和周次，确认后追加课程并跳过重复时段。缺失周次在审阅页按当前学期范围预填，并提示用户核对。

## 云端配置

当前默认调用 TokenHub，不使用腾讯云执行角色调用混元。配置以下云函数环境变量，密钥不要写入源码或小程序：

- `TOKENHUB_API_KEY`：必填，已开通视觉模型的服务密钥。
- `TOKENHUB_BASE_URL`：可选，默认 `https://tokenhub.tencentmaas.com/v1/chat/completions`。
- `TOKENHUB_VISION_MODEL`：可选，当前默认 `hy-vision-2.0-instruct`，应以账户实际可用模型为准。

也支持 DeepSeek 官方视觉接口：`SCHEDULE_VISION_PROVIDER=deepseek` 时使用 `DEEPSEEK_API_KEY` 调用 `https://api.deepseek.com/chat/completions`，固定模型 `deepseek-flash`。未设置切换变量时继续使用 TokenHub；切换后若 DeepSeek 密钥缺失，会明确报配置错误，不会偷偷回退并产生 TokenHub 调用。密钥可通过 `tools/cloud-deploy/configure-deepseek.ps1` 在本机隐藏输入：脚本先调用 DeepSeek `/models` 核对密钥和模型，再保留原有云函数环境变量、写入密钥并切换提供方。不要在聊天、仓库或日志中粘贴密钥。

部署文件为同目录 `cloudbaserc.json`，运行时 Nodejs20.19，超时 60 秒。当前环境由腾讯云侧创建，小程序经 `/schedule-image-import` HTTPS 路由分片上传图片并调用函数。

图片压缩后限 3MB，仅接受 JPEG、PNG、WEBP。上传分片暂存在 `claswee_image_import_chunks`，识别请求结束即删除；中断后的残留分片由定时任务清理。应用代码不将完整图片写入日志。模型供应商的数据处理规则仍需按所用服务核实。

如启用 NoSQL，可建 `claswee_image_import_limits` 集合并限制为仅云函数可访问。目前数据库不可用时只实行实例内每日计数，不能作为全局严格限额。

## 当前验证状态（2026-09-22）

已部署云函数、上传开发版 `0.4.2-image.20260922`，微信编译通过。自动测试覆盖周次必填、单双周、多时段、重复导入、取消和设置变化。
云端真实调用返回 `TOKENHUB_NOT_CONFIGURED`，尚未完成模型识别验证。接通服务后必须用完整课表和缺周次课表分别验证，不得把代码测试通过当作识别成功。

## 续接记录（2026-09-22）

已修复小程序首次进入时的课程归属（跟随当前用户）、选图期间误触识别、离开页面后的异步回调；云端拒绝布尔型周次，对被丢弃课程和模型截断给出提示，缺密钥时不消耗识别次数。7 项本地测试通过。云函数修复已部署，小程序开发版 `0.4.3-image.20260922` 上传成功（1933088 字节，记录见项目根目录 `upload-image-import-fixes.json`），尚未正式发布。

部署后云端复测仍返回 `TOKENHUB_NOT_CONFIGURED`（RequestId: `47a2e513-5717-4b0c-a30b-5bee8595525c`），真实图片识别仍待模型密钥配置后验证。

CloudBase CLI 登录可用，但当前临时凭证调用 `tokenhub:DescribeApiKeyList` 返回 `AuthFailure.UnauthorizedOperation`，不能用此授权创建或读取 TokenHub 密钥。

在 TokenHub 控制台创建有视觉模型访问权限的 API Key 后，在本地 PowerShell 运行：

```powershell
& 'D:\codex 对话\codextask\couple-schedule-v41\tools\cloud-deploy\configure-image-import.ps1'
```

脚本隐藏输入密钥，通过标准输入交给配置程序，保留云函数现有环境变量并写入 TokenHub 配置，不将密钥写入本地文件或日志。默认模型为 `hy-vision-2.0-instruct`；若账号使用其他视觉模型，可先设置 `$env:CLASWEE_VISION_MODEL`。配置提交成功仍需真实截图验证。

## 2026-09-23：手机端连接修复

用户真机截图显示“识别服务连接失败”。云端密钥现已配置，云函数直接调用和 HTTPS 最小图片调用均成功。目标环境由腾讯云侧创建，小程序 `wx.cloud.callFunction` 无法在当前未转换的环境中直接使用。已为函数创建 `/schedule-image-import` HTTPS 路由，复用小程序同步功能正在使用的请求域名。

此路由实测大于约 100 KB 的 JSON 请求会返回 HTTP 413，无法直接发送完整课表。小程序现在将压缩后的 JPEG/PNG/WEBP Base64 每 60000 字符分片上传到 `claswee_image_import_chunks`，全部上传后云端拼合、校验、识别，并删除分片。30 分钟未完成的分片由 `imageImportCleanup` 定时触发器每小时清理；该触发器已创建且手动调用验证通过。该表的 RLS 只允许带 `CLASWEE_DB_KEY` 的服务请求操作，建表脚本为 `chunks.sql`。

实际用户图片 `2bd610008e2d22f841695030fcfca6fa.jpg` 约 227 KB，经过 6 个分片成功识别出 8 门候选课程。该图片只展示 WEEK 4，且没有明确节次标记，模型最初错误推断成第 1–20 周，并将教室号末位当作节次。已增加逐项证据要求和服务端校验：没有明确“1–16周”“第1节”等字样时，周次和节次保持空白，确认导入前必须人工补全。清晰样例 `tests/fixtures/clear-schedule.png` 可正确识别 3 门课程及明确写出的周次、节次。9 项测试通过。小程序开发版 `0.4.5-image.20260923` 上传成功，预览码在项目根目录 `miniprogram-preview-image-chunks.png`；真机最终交互仍待用户验证。

## 2026-09-23：节次位置建议

用户指出图片能看出课程卡片在午休、晚休前后的相对位置。现在模型可返回每张卡片的上午/下午/晚间上排、下排或跨两排位置，服务端只在当前用户节次时间恰好能对应每段四节时换算成节次建议。建议与图片明写的节次分别保存：建议不自动写入 `s1/s2`，用户逐项核对并点击“采用”后才可导入；原图未显示的起止周仍必填。对用户图片复测识别出 8 门课程，12 个时段均得到位置建议，但其中至少 1 个建议与图片布局不符，因此不得视为准确节次。10 项本地测试通过。
云函数已更新，小程序开发版 `0.4.6-image.20260923` 已上传，预览码为项目根目录 `miniprogram-preview-image-suggestions.png`。微信编译通过，真机交互仍待用户核对。

## 2026-09-23：DeepSeek 官方视觉接口适配

已按 DeepSeek 官方文档增加 `deepseek-flash` 分支，沿用当前分片上传和课程审阅界面。DeepSeek 请求使用官方 `/chat/completions`、原图细节、关闭思考、JSON 输出；云函数代码已部署，11 项本地测试通过。适配完成时尚无 `DEEPSEEK_API_KEY`，因此当时未切换。`tools/cloud-deploy/configure-deepseek.ps1` 可在本机隐藏输入 API Key，脚本验证 `/models` 可用后再一次性更新函数环境变量。后续启用与真实截图测试见下一节。

## 2026-09-23：DeepSeek 已启用并实测

用户在本机运行隐藏输入脚本后，云函数环境确认 `SCHEDULE_VISION_PROVIDER=deepseek` 且存在 DeepSeek 密钥；密钥未打印。真实图片 `2bd610008e2d22f841695030fcfca6fa.jpg` 经 6 个分片调用 DeepSeek 成功，返回 8 门合并后的候选课程。DeepSeek 原始结果常将同名同地点、同教师的不同上课卡片拆为多条，现服务端按课程身份合并时段，不合并不同地点、教师或周次的课程。清晰样例也识别出 3 门课程及明确的周次、节次。11 项本地测试通过。

真实长截图的星期和位置建议在重复调用中出现偏差：例如模型曾将周一晚上卡片错配到周二，也输出与图片相矛盾的“周一无课程”提醒。节次建议仍需人工点选采用；导入前要逐项核对星期、节次和周次。真机交互尚未复测。

## 2026-09-23：PaddleOCR 文字坐标预处理

用户选择的原图在 3MB 内直接上传，不再二次压缩。长图先由同一 CloudBase 环境的私有 `scheduleOcr` Python 函数提取中文文字、置信度、原图坐标及最多四张纵向分区图，再将低清全图、高清分区图和文字坐标交给现有 DeepSeek 接口。函数使用 PaddleOCR 官方 PP-OCRv5 mobile 检测、识别 ONNX 模型，通过 RapidOCR + ONNX Runtime 在 CPU 推理；这是精简 ONNX 推理实现，不调用收费 OCR API。Linux 部署包使用 `opencv-python-headless`，避免云函数缺少 `libGL`。部署包约 160MB 压缩、371MB 解压，函数配置 Python 3.11 / 3072MB / 50 秒。

后端将有置信度的星期或连续七天日期标题与课程名称 OCR 锚点的横坐标对齐。位置证据明确时修正模型的星期；缺少锚点或位置不清时标为“星期待核对”，不凭空改判。OCR 出错或超时时继续走原有 DeepSeek 识图。课程卡片的节次位置建议自动填进审阅页并标为“AI 推测”，用户仍能逐项修改，最终必须确认才导入；图片未明确写出的课程周次仍为空、必须手填。

`scheduleOcr` 是普通事件函数，没有公开 HTTP 路由，并要求两函数共享的 `SCHEDULE_OCR_SERVICE_KEY`；令牌只存在云函数环境变量，客户端不能直接调用。运行 `node tools/cloud-deploy/link-schedule-ocr.js` 可生成并绑定令牌，脚本不打印密钥。`ocr.sql` 创建临时 OCR 表 `claswee_image_import_ocr`；同分片表一样只允许服务端凭 `CLASWEE_DB_KEY` 操作。识别完成或取消后立即删除，原定时触发器每小时清理超过 30 分钟的残留记录。部署新函数前先执行迁移：

```powershell
$ddl = Get-Content 'miniprogram/cloudfunctions/scheduleImageImport/ocr.sql' -Raw
tcb db execute -e masic-blog-d6g6d4r87bc035c0e --sql $ddl --json
```

在 `miniprogram/cloudfunctions/scheduleOcr` 下运行 `py build.py`，脚本将 Linux 依赖与官方模型打成系统临时目录中的 `scheduleOcr.zip`；使用解压后的目录部署 `scheduleOcr`，`installDependency=false`。上传原图和分区图会增加 DeepSeek 图片 token，OCR 函数会消耗现有 CloudBase 额度。手机端应先在审阅页核对星期、课程、地点、教师与 AI 节次，再确认导入。

本次已在现有环境执行迁移并部署两支函数。长截图 `2bd610008e2d22f841695030fcfca6fa.jpg` 的 OCR 云端实测返回 83 条文字和 4 张分区图，耗时约 7.5 秒、内存约 447MB。完整链路复测稳定返回 8 门课程、12 个时段，12 个星期均由 OCR 坐标确认；图片未写明的课程周次仍全部为空。`tests/fixtures/clear-schedule.png` 返回 3 门课，明写的周次和节次正确保留。1×1 图片使 OCR 失败时 `prepare` 返回 `ocrReady=false`，可继续使用原有识图路径；未带私有令牌直接调用 OCR 会被拒绝。识别结束后 OCR 与分片表对应记录均为零，手动触发清理函数也删除了超过 30 分钟的测试记录。14 项本地测试通过，包括 OCR 超时回退和 3MB 边界校验。

小程序开发版 `0.4.7-image.20260923` 已上传并生成 `miniprogram-preview-image-ocr.png`。微信开发者工具编译及预览成功；用户手机端逐项审阅、确认导入仍需用预览码验收，不能将云端调用视为真机交互验收。

## 2026-09-23：识图提速

原 60,000 字符分片按顺序上传；现改为 80,000 字符分片，第一片确认后最多四片并发上传。`chunks-speed.sql` 将现有分片表的长度约束同步提高到 80,000；旧客户端仍可继续传 60,000 字符分片。并发批次等待全部在途请求结束后才执行失败清理，避免取消后又写入残片。OCR 的四个纵向分区在同一 Python 函数内并行推理，保留原检测与识别模型、原图坐标和分区图片。云端比较四线程与两线程后保留四线程；文字与坐标结果一致。

用户长截图的本轮实测：旧版 6 片串行上传 2.55 秒，新版 4 片并发上传 1.24 秒；完整链路一次热运行约 12 秒，仍识别出 8 门课程、12 个经 OCR 坐标确认的时段。网络、云函数冷启动及 DeepSeek 响应会使总耗时波动。本次未改模型精度或裁剪数量，也未增加 OCR API 服务。

15 项本地测试通过，包含并发上传部分失败时的残片清理。恰好 3MB 的上传边界用 53 个分片在云端完成并取消清理，上传约 14.9 秒；该探针只验证传输，不代表真实 3MB 图片的 OCR 时间。云函数及数据库约束已更新，小程序开发版 `0.4.8-image.20260923` 已上传，预览码为项目根目录 `miniprogram-preview-image-speed.png`。手机端完整识别耗时需以真机网络为准。

## 2026-09-23：缺失周次默认值与审阅排版

新建学期总周数默认 19 周；已有用户自行设置的总周数保持原值。服务端继续仅在截图明确给出课程周次范围时返回周次证据；若没有证据，审阅页将起始周预填为 1、结束周预填为当前学期最后一周，并明确提示这是默认值。图片明写的范围保持原值。用户可修改起止周，仍须点击确认并通过二次确认才能导入。星期几独占一行，起始节数和结束节数并排一行，上课频率独占一行且每门课程只显示一次。

18 项本地测试通过。`scheduleImageImport` 已重新部署；小程序开发版 `0.4.9-image.20260923` 已上传，预览码为项目根目录 `miniprogram-preview-image-weeks-layout.png`。微信开发者工具预览编译成功；手机端排版仍需用该码查看。

## 2026-09-24：午休与晚休位置可配置

设置页“节次时间”增加午休、晚休分别在第几节后的选择。按节数课表是两人共用网格，因此两条休息分隔线共用位置；两人的具体节次时间仍独立设置。旧数据补齐为午休第 4 节后、晚休第 8 节后。调整分隔位置会同步更新网格高度、休息行与跨行课程卡片的切分，晚休始终晚于午休；设置在最后一节后的休息行不显示。截图识别的 AI 节次推测也接收当前分隔位置，仍须在审阅页核对。

21 项本地测试通过，包含旧数据迁移、非默认分隔位置的卡片切分和设置页选择联动。`scheduleImageImport` 已重新部署；小程序开发版 `0.5.0-rest.20260924` 已上传，预览码为项目根目录 `miniprogram-preview-rest-boundaries.png`。开发者工具预览编译成功；手机端显示以真机预览为准。
