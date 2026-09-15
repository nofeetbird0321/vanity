# Vanity Forge

纯静态 GitHub Pages 网站：在浏览器本地生成 EVM 靓号地址。

仓库：<https://github.com/nofeetbird0321/vanity>
站点：<https://vanity.nofeetbird.tech>

## 本地运行

不能直接双击 `index.html`，因为浏览器会限制本地文件创建 Worker。使用任意静态服务器，例如：

```bash
python3 -m http.server 4173
```

然后访问 <http://127.0.0.1:4173/>。

## GitHub Pages

1. 把本目录内容推送到 GitHub 仓库。
2. 在仓库 Settings → Pages 中选择从 `main` 分支的根目录发布。
3. GitHub Pages 发布完成后，默认地址为 `https://nofeetbird0321.github.io/vanity/`。
4. 在 GitHub Pages 的 Custom domain 中填入 `vanity.nofeetbird.tech`。
5. 在 Cloudflare DNS 添加一条记录：

   - Type: `CNAME`
   - Name: `vanity`
   - Target: `nofeetbird0321.github.io`（不要带仓库名）
   - Proxy status: `DNS only`（灰云）

6. 等待 DNS 生效后回到 GitHub Pages，勾选 Enforce HTTPS。

GitHub Pages 的子域名应直接 CNAME 到 `用户名.github.io`。Cloudflare 代理灰云是 GitHub 官方 HTTPS 配置最稳妥的起点；确认 GitHub HTTPS 正常后，再评估是否需要开启橙云。

## 隐私与安全边界

- 没有后端、API、CDN 脚本、统计或网络请求；页面 CSP 也禁止 `connect-src`。
- 私钥由浏览器 `crypto.getRandomValues()` 生成，只在当前页面与本地 Worker 内存中流转。
- 页面刷新、关闭或停止任务后不会保存生成结果。
- 纯 JavaScript secp256k1 / Keccak-256 实现适合本地实验和靓号生成；使用生成地址前，请自行离线核对并先用小额资金验证。

## 现实限制

每增加一个目标字符，平均尝试次数增加 16 倍。更长靓号可能需要数小时甚至更久，浏览器标签页也必须保持打开。
