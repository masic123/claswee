# Claswee 共享课程表

Claswee 是一款双人课表应用，支持查看双方课表和共同空闲时间、导入课程、通过房间同步，以及生成用于分享的课表图片。

| 版本 | 入口 |
| --- | --- |
| 网页版 | [couple-schedule-v41](couple-schedule-v41/) |
| 微信小程序 | [couple-schedule-v41/miniprogram](couple-schedule-v41/miniprogram/) |
| Android | [claswee-android](claswee-android/) |

## 本地运行

- 网页版可通过本地静态服务器打开 `couple-schedule-v41/index.html`。安装和离线缓存需要 HTTPS 或 localhost。操作方式见[使用说明书](couple-schedule-v41/使用说明书.md)。
- 用微信开发者工具导入 `couple-schedule-v41/miniprogram`。自建部署时使用自己的小程序 AppID、CloudBase 环境及客户端接口地址。云端运行配置和数据库迁移见[云函数说明](couple-schedule-v41/miniprogram/cloudfunctions/README.md)。
- Android 客户端使用 Vue 3 和 Capacitor。在 `claswee-android` 下运行 `npm ci` 和 `npm run dev` 可预览界面。运行 `npm run android:sync` 后，用配置了 JDK 21 和 Android SDK 36 的 Android Studio 打开 `android/` 构建。

## 验证

在仓库根目录运行小程序的单元测试。

```sh
node --test couple-schedule-v41/tests/*.test.js
```

在 `claswee-android` 下运行 `npm test` 和 `npm run build` 可验证 Android 客户端前端。

## 许可

项目源码采用 [MIT 许可证](LICENSE)。随项目提供的第三方组件沿用各自的许可证和版权声明。
