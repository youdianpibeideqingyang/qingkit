# QingKit

macOS 菜单栏小工具：**JSON 处理** + **把本机网页转成手机可扫的二维码**。

点菜单栏图标弹出面板，失焦自动收起；点右上角图钉可以固定住。点 ⤢ 或按 `⌘E` 切换成**可拖动、可缩放的大窗口**（JSON 左右分栏），再按一次收回菜单栏。`⌘1` / `⌘2` 切换页签，`Esc` 收起。

## 功能

### 二维码

- 输入 `localhost:8080/path`（或只写 `8080`），自动换成局域网 IP 生成二维码
- 一键读取剪贴板、Chrome / Safari 当前标签页
- 列出本机正在监听的端口，点一下出码；标出“局域网可访问”和“仅本机”
- 自动检测手机能否访问。服务只监听 `127.0.0.1` 时提示改法，比如 `vite --host 0.0.0.0`
- 多网卡（Wi‑Fi / 有线 / VPN / 虚拟网卡）可选，默认推荐 Wi‑Fi
- 复制链接、复制二维码图片、浏览器打开

### JSON

- 格式化 / 压缩 / 校验，报错指出行列和可能原因，比如“第 3 行末尾少了一个逗号”
- **超长整数（订单号等）和 `49.00` 这种写法按原文保留**，不会被 JavaScript 截断
- 转义 / 反转义，多层转义字符串一次解开
- 自动识别并转换：URL 参数、键值对 / `.env`、YAML、JS 对象（无引号键名、单引号、注释、末尾逗号）
- 树形查看：折叠展开、搜索键或值；点节点复制 JSONPath 或 JS 路径，也可以复制值
- 结果里搜索（`⌘F`）：全部高亮，`↵` / `⇧↵` 在命中之间跳转，可区分大小写；输入 `:120` 直接跳到第 120 行
- 只渲染可见的行，几万行的大文件也不卡
- 粘贴后自动格式化，也可以把 .json 文件拖进输入框；`⌘↵` 格式化

## 安装

到 [Releases](../../releases) 下载 dmg，把 QingKit 拖进「应用程序」。

应用没有签名，第一次打开前在终端执行：

```bash
xattr -dr com.apple.quarantine /Applications/QingKit.app
```

第一次读取 Chrome / Safari 当前页时，系统会询问是否允许 QingKit 控制该浏览器，选“好”即可。之后可以在「系统设置 › 隐私与安全性 › 自动化」中修改。

## 开发

需要 Node 20+ 和 Rust（`curl https://sh.rustup.rs -sSf | sh`）。

```bash
npm install
npm run app:dev      # 启动开发版（菜单栏出现图标）
npm test             # 单元测试
npm run app:build    # 打包，产物在 src-tauri/target/release/bundle/
```

只调界面样式时可以运行 `npm run dev`，在浏览器打开 http://localhost:1420，此时用的是演示数据。

### 发布新版本

```bash
# 先改 package.json 和 src-tauri/tauri.conf.json 里的版本号
git tag v0.1.1 && git push origin v0.1.1
```

GitHub Actions 会自动打包通用版（Apple 芯片 + Intel）并发到 Releases。

### 更换图标

把 1024×1024 的 PNG 覆盖到 `app-icon.png`，然后执行：

```bash
npx tauri icon app-icon.png
```

菜单栏图标是 `src-tauri/icons/tray.png`（黑色 + 透明，44×44，系统会自动适配深色菜单栏）。矢量源文件在 `design/` 里。

## 技术栈

Tauri 2（Rust）+ React + TypeScript + Vite。JSON 解析用 `jsonc-parser`，基于文本处理，所以数字能保持原文。端口扫描用系统自带的 `lsof`，网卡识别用 `networksetup`，读取浏览器地址用 AppleScript。
