# 录音豆本地工作台

在线体验：https://recording-bean-web.pages.dev

一个面向 `soundcore Work / 飞书录音豆 D3200` 的隐私优先网页工具。使用支持 Web Bluetooth 的浏览器直接连接设备、读取和整理录音，无需账号，也不需要本项目的后端服务器。

> 非飞书、安克或 Soundcore 官方项目。仅操作你拥有或获授权管理的设备，并自行备份重要录音。

## 已实现

- 浏览器 BLE 直连 D3200，分别读取录音豆/充电仓电量与充电状态，以及固件、存储和录音列表；
- ECDH / HKDF / AES 本地解密录音，生成 Ogg/Opus，并在浏览器允许时转换为 WAV；
- 在线播放、单条下载、批量导出和批量删除；
- 开始录音、继续录音与暂停录音；
- 每 12 秒自动发现新录音，也可手动刷新；
- 本地资料库、搜索、重命名和标签；
- 可编辑的转录与总结，支持会议纪要、闪念笔记、访谈整理和自定义要求；
- ZIP 资料包：音频、转录、总结与 JSON 元数据；
- PWA 安装入口和桌面 / 手机响应式界面。

为避免高风险误操作，公开网页不提供解绑、恢复出厂、OTA 固件升级和“查找设备”等控制。

## 浏览器兼容性

| 平台 | 浏览器 | 直接连接录音豆 |
| --- | --- | --- |
| Windows | Chrome / Edge | 支持 |
| macOS | Chrome / Edge | 支持 |
| Android | Chrome | 支持 |
| iPhone / iPad | Chrome / Safari | 不支持 |

iOS 上的 Chrome 仍使用 WebKit，而 WebKit 没有开放 Web Bluetooth。iPhone 需要原生 iOS App；部署网页不能绕过这个限制。

## 隐私模型

- 设备通信、录音解密、播放和 ZIP 打包都在浏览器中完成；
- 音频不会自动上传或写入本站服务器；
- 标题、标签、转录和总结保存在当前浏览器的 `localStorage`；
- SiliconFlow API Key 只保存在当前页面内存，刷新或关闭页面后消失；
- 使用转录/总结时，音频或文字由浏览器直接发送到 SiliconFlow，不经过本项目服务器；
- Cloudflare Pages 只托管静态 HTML、CSS、JavaScript 和设备图片。

第三方 API 的数据处理仍受其服务条款和隐私政策约束。不要把 Key 写入源码、提交到 GitHub，或放进 Cloudflare 环境变量。

## 本地开发

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。Web Bluetooth 要求 HTTPS 或 `localhost` 安全上下文。

```bash
pnpm test
pnpm build
pnpm preview
```

生产文件输出到 `dist/`。

## 部署到 Cloudflare Pages

构建设置：

- Framework preset：`Vite`
- Build command：`pnpm build`
- Build output directory：`dist`
- Node.js：`20` 或更高版本

也可以使用 Wrangler：

```bash
pnpm build
npx wrangler pages deploy dist --project-name recording-bean-web
```

正式地址必须使用 HTTPS，浏览器才会允许 Web Bluetooth。

## 代码结构

- `src/direct/protocol.js`：D3200 命令编码和响应解析；
- `src/direct/d3200BrowserClient.js`：Web Bluetooth 会话、设备状态、导出与解密流程；
- `src/direct/crypto.js`：ECDH / HKDF / AES；
- `src/direct/oggOpus.js`：Ogg/Opus 封装和可选 WAV 转换；
- `src/direct/siliconflow.js`：浏览器直连的转录与总结请求；
- `src/direct/localWorkspace.js`：本地文字资料；
- `src/components/`：界面组件。

## 研究来源与致谢

协议实现参考了社区研究项目 [tacshi/Soundcore](https://github.com/tacshi/Soundcore)，并结合本项目的 D3200 实机抓包与验证重新实现。社区项目当前未附带许可证，因此本仓库没有复制其源代码，只使用了公开的互操作信息。

## 已知限制

- 同一台录音豆不能同时被飞书 App 和本网页稳定占用 BLE 连接；
- 浏览器关闭后无法后台自动同步；
- 大文件经 BLE 导出需要保持页面在前台并耐心等待；
- SiliconFlow 的浏览器跨域策略若发生变化，直连转录/总结可能失效；本项目不会偷偷回退到中转服务器；
- 录音时长在导出前是基于设备元数据的估算，完整导出后会按实际 Opus 帧数校正。

## License

[MIT](./LICENSE)
