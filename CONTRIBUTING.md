# 参与 Roomly

欢迎提交问题反馈和改进建议，也欢迎通过 Pull Request 贡献代码。

## 反馈问题

请描述操作步骤、预期结果、实际结果，以及使用的浏览器。可以附上截图或示例 JSON，但请勿提交自己的真实住址、含个人信息的户型图或密钥；复现问题时可以用虚构尺寸。

## 本地开发

1. Fork 仓库并克隆到本机，安装 Node.js 24 LTS。
2. 运行 `npm ci`，再运行 `npm run dev`。
3. 修改后运行 `npm run lint`、`npm test`、`npm run build`。
4. 碰撞检测、门洞或交互有改动时，请同时运行 `npm run test:e2e`。

Windows 的本地浏览器测试默认使用 Edge。其他系统先运行 `npx playwright install chromium` 安装测试浏览器；Linux CI 使用 `npx playwright install --with-deps chromium`。

请在 Pull Request 中说明解决的问题、修改后的行为以及验证方式。涉及尺寸或碰撞判断时，提供能说明边界条件的测试。

提交的贡献遵循本仓库的 MIT 许可。
