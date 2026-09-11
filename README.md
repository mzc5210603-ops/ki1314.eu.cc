# NewsHub - 资讯聚合网站

纯前端资讯聚合网站，基于原生 HTML + CSS + JavaScript 构建，无任何第三方前端框架依赖。
通过 GitHub Actions 每日定时自动抓取公共新闻 API 并生成静态 JSON 数据，部署于 GitHub Pages，彻底绕过浏览器跨域问题。

---

## ✨ 功能特性

| 功能 | 说明 |
| --- | --- |
| 📰 首页信息流 | 卡片网格展示资讯，响应式多列布局 |
| 🗂️ 资讯分类 | 科技/财经/体育/娱乐/健康/科学/国际 7 大分类 |
| 🔍 关键词搜索 | 实时搜索标题、摘要、来源、作者、标签 |
| 🏷️ 标签筛选 | 自动提取热门标签 + 多标签 AND 逻辑筛选 |
| 🌓 明暗主题 | 亮/暗主题切换 + 跟随系统 + 本地记忆 |
| 📖 分页加载 | 智能页码 + 上下页 + 持久化当前页 |
| 📱 移动端适配 | 响应式布局 + 抽屉式侧边栏 + 触控优化 |
| 🔄 每日自动更新 | GitHub Actions 每日定时抓取并提交 data.json |
| 🚀 纯静态部署 | 读取本地 JSON 渲染，零跨域问题 |

---

## 📁 项目结构

```
vsdgr156/
├── index.html                    # 主页面
├── css/
│   └── style.css                 # 样式（含明暗主题 + 响应式）
├── js/
│   └── app.js                    # 逻辑（渲染/筛选/分页/主题…）
├── data.json                     # 静态资讯数据（由脚本自动生成）
├── scripts/
│   ├── fetch_news.py             # 新闻抓取主脚本
│   └── requirements.txt          # Python 依赖
└── .github/
    └── workflows/
        └── fetch-news.yml        # GitHub Actions 定时配置
```

---

## 🚀 一分钟快速部署（GitHub Pages）

### 步骤 1：创建 GitHub 仓库并上传代码

```bash
# 1. 初始化本地仓库
git init
git add -A
git commit -m "feat: 初始化 NewsHub 资讯聚合站"

# 2. 创建 GitHub 仓库后（建议 Public 仓库，Pages 免费）
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

> ⚠️ 建议仓库为 **Public**：私有仓库启用 Pages 需要 Pro 账户。

---

### 步骤 2：启用 GitHub Pages

1. 进入仓库 **Settings** → 左侧菜单 **Pages**
2. **Build and deployment** → **Source** 选择 **Deploy from a branch**
3. **Branch** 选择 `main` / 目录选择 `/ (root)` → 点击 **Save**
4. 稍等 1~2 分钟，上方提示 `Your site is live at https://<用户名>.github.io/<仓库名>/`
5. 打开此链接即可看到网站，`data.json` 内的 54 条示例数据会被渲染出来

---

### 步骤 3：允许 Actions 自动推送代码（关键！）

为了让定时脚本能够把生成的 `data.json` 提交回仓库：

1. 仓库 **Settings** → 左侧 **Actions** → **General**
2. 滚动到 **Workflow permissions** 区块
3. 选择 **Read and write permissions**（读写权限）
4. 勾选 **Allow GitHub Actions to create and approve pull requests**（可选，更保险）
5. 点击 **Save**

---

### 步骤 4：手动触发一次 Actions 验证数据抓取

1. 仓库顶部 **Actions** → 左侧选择 **每日自动更新新闻数据**
2. 点击右侧 **Run workflow** → 绿色按钮再次点击
3. 等待 Job 执行完成（约 1~3 分钟）
   - ✅ 成功：`data.json` 会被更新，并自动触发 Pages 重新部署
   - ❌ 失败：点开失败的 run 查看日志定位原因

---

### 步骤 5：（可选）添加付费 API Key 扩充数据源

脚本默认使用 **Hacker News / BBC RSS / CNN RSS / Reuters RSS / Dev.to** 等 **完全免费无需 Key** 的数据源，开箱即用。

若要启用 **NewsAPI**（100 请求/天免费） 或 **GNews**（100 请求/天免费） 扩充中文/更多分类数据：

1. 仓库 **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. 添加以下任意一项或两项：
   | Name | Value（申请地址） |
   | --- | --- |
   | `NEWS_API_KEY` | https://newsapi.org/ 注册获取 |
   | `GNEWS_API_KEY` | https://gnews.io/ 注册获取 |
3. 再次触发 Actions，脚本会自动检测环境变量并启用这两个数据源

---

## ⏰ 定时任务说明

默认配置（`.github/workflows/fetch-news.yml`）：

- **每天 UTC 00:00** = **北京时间 08:00** 自动运行
- 支持手动触发（Actions → Run workflow）
- 修改代码 / workflow 推送时也会触发一次（便于调试）

**修改时间**：编辑 workflow 中的 `cron` 字段（UTC 时区），例如：

```yaml
# 每天北京时间 9:30 = UTC 1:30
schedule:
  - cron: '30 1 * * *'
```

---

## 💻 本地预览 & 调试

本地打开 `index.html` 直接双击即可，但 `fetch('data.json')` 可能被浏览器 `file://` 协议限制。
推荐用任意静态服务器：

```bash
# 方法 1：Python 自带
python -m http.server 8080

# 方法 2：Node.js（如有）
npx serve .

# 方法 3：VS Code 插件 Live Server
```

然后浏览器访问 http://localhost:8080

### 本地调试抓取脚本

```bash
cd scripts
pip install -r requirements.txt
python fetch_news.py
# 运行完成后会覆盖生成根目录的 data.json
```

---

## 🧩 data.json 数据格式说明

前端可识别的三种格式（任选其一）：

```jsonc
// 格式 A（推荐，脚本生成的标准格式）
{
  "updatedAt": "2026-08-04T08:00:00+08:00",
  "total": 150,
  "articles": [
    {
      "id": "唯一ID",
      "title": "标题",
      "summary": "摘要",
      "url": "原文链接",
      "image": "配图URL（可空）",
      "category": "tech | business | sports | entertainment | health | science | world | all",
      "source": "来源名",
      "author": "作者",
      "publishedAt": "ISO 时间字符串",
      "tags": ["AI", "GPT"],
      "popularity": 12345
    }
  ]
}

// 格式 B（直接 articles 数组，兼容 NewsAPI 原始格式）
[ {...}, {...} ]

// 格式 C（key 为 news）
{ "news": [ {...}, {...} ] }
```

### 分类枚举

前端侧栏显示的分类与对应英文 key：

| 分类 | key |
| --- | --- |
| 全部 | `all` |
| 科技 | `tech` |
| 财经 | `business` |
| 体育 | `sports` |
| 娱乐 | `entertainment` |
| 健康 | `health` |
| 科学 | `science` |
| 国际 | `world` |

其余分类会归为"其他"，在全部列表中可见。

---

## 🎛️ 自定义指南

- **每页条数**：编辑 `js/app.js` 顶部 `CONFIG.PAGE_SIZE`
- **热门标签数量**：`CONFIG.MAX_TAGS`
- **配色主题色**：`css/style.css` 顶部 `:root` 内的 `--accent`、`--accent-hover`
- **抓取数量上限**：`scripts/fetch_news.py` 顶部 `MAX_PER_SOURCE`、`MAX_TOTAL_ARTICLES`
- **新增 RSS 源**：在 `fetch_news.py` 仿照 `fetch_bbc_rss` 写一个函数，并加入 `collect_all()` 中的 `sources` 列表
- **新增需 Key 的 API**：函数内用 `os.environ.get("XXX_API_KEY")` 取密钥，workflow yaml 的 `env` 段里声明 `${{ secrets.XXX_API_KEY }}`

---

## 🛠️ 常见问题 FAQ

**Q1: Pages 页面显示 404 / 白屏？**
- 确认 Settings → Pages 已开启并选择了正确分支
- 浏览器控制台（F12）检查是否 404 了 `data.json`，路径是否多了子路径（项目名子路径），通常原生相对路径即可，无需修改

**Q2: Actions 运行成功但 data.json 没更新？**
- 检查 **Workflow permissions** 是否设置为 **Read and write**
- 看 run 日志中的 "检查 data.json 是否变化" step，若显示 `无变化，跳过提交` 是正常逻辑（内容未变不重复提交）

**Q3: 抓取到的新闻太少 / 多为英文？**
- 默认免费源以英文为主；添加 `GNEWS_API_KEY` 可在参数中改 `lang: "zh-cn"` 抓中文
- 自行添加中文 RSS（如新浪、网易、新华网 RSS 接口）

**Q4: 能否部署到其他静态托管？（Vercel / Netlify / Cloudflare Pages）**
- 完全可以：所有资源都是纯静态。将 `GitHub Pages` 步骤替换为对应平台的部署即可；
  定时抓取部分可以保留在 GitHub Actions（它会 push 回仓库，触发 Vercel 等的 webhook 重建），也可迁移到各平台的 Cron 功能。

**Q5: 本地用 file:// 打开报错跨域？**
- 跨域是浏览器对 file:// 的安全限制。正常部署到任何 HTTP(S) 服务器或用本地静态服务器即可解决（见【本地预览】章节）。

---

## 📦 技术栈

- 前端：原生 HTML5 + CSS3 + 原生 ES2022 JavaScript（零依赖）
- 样式：CSS 变量驱动主题 + Grid/Flex 响应式 + SVG 图标（内联）
- 抓取：Python 3.11 + `requests` + `feedparser` + `python-dateutil`
- 自动化：GitHub Actions（Ubuntu 最新 + Python 3.11 官方镜像）
- 部署：GitHub Pages（纯静态，零运行时成本）

---

## 📄 License

MIT - 可自由用于个人或商业用途。
