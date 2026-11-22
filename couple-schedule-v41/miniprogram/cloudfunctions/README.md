# claswee 云函数部署

## 安全房间服务

生产环境为 `masic-blog-d6g6d4r87bc035c0e`，云函数为 `scheduleRoom`，网页 HTTP 路由为 `/schedule-room`。

1. 使用 `tcb db execute` 执行 `scheduleRoom/migration.sql`。脚本可重复执行。
2. 为云函数环境变量 `CLASWEE_DB_KEY` 生成高强度随机值，并把其 SHA-256 写入 `claswee_service_config.key_hash`。
3. 部署 `scheduleRoom`，运行环境为 Node.js 20，开启云端安装依赖。
4. PostgreSQL 房间表启用了 RLS；只有携带正确内部服务密钥的云函数请求能访问，网页和小程序不能直读数据库。

后台可在 PostgreSQL 的 `claswee_rooms` 表查看：

- `room_code`：房间号
- `created_at`：创建时间
- `last_active_at`：最后活跃时间
- `member_count`：加入过的设备数量
- `data_updated_at`：课表最后更新时间
- `claimed_from_legacy`：是否由旧云存储房间认领迁移

`password_hash` 是带随机盐的 scrypt 哈希，`claswee_room_sessions` 也只保存令牌哈希。不要把表权限或 `CLASWEE_DB_KEY` 开放给客户端。

原有 `schedules/房间码.json` 文件不得删除。`claimLegacy` 只读取并复制旧课表，不修改原文件。
