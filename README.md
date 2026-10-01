# 潮汐拆塔队 · Tidal Tower

一款打开浏览器就能玩的原创 3D 炮击小游戏。拖动瞄准、松开发射，在有限炮弹内让积木落入海中。八关依次解锁，包含双塔连桥、支撑框架、阶梯、低墙和塔群。

## 怎么玩

- 鼠标或单指：在场景中按下拖动，松开发射。上拖抬高炮口，左右拖动转向。
- 键盘：方向键调整瞄准，空格发射，Esc 暂停或继续。
- 每关击落至少 80% 方块即可过关；炮弹发射后等待倒塌，最后一发也有完整观察时间。
- 通关获得 1 星，剩余 1 发获得 2 星，剩余至少 2 发获得 3 星。选关页可重玩已解锁关卡。
- 进度和声音设置保存在当前浏览器；不同设备不自动同步。游戏本身没有账号、广告或支付。

## 在云端运行

推荐 Node.js 24，最低满足 Vite 8 的 Node.js 要求（20.19+ 或 22.12+）。

```bash
npm ci
npm run dev
```

按终端输出的地址访问。远程云端的 localhost 不是用户设备可访问的地址；外部试玩使用经过部署的 HTTPS 链接。受限环境可加 `--cache /tmp/tidal-tower-npm-cache` 安装，避免默认缓存目录权限问题。

```bash
npm run typecheck
npm test
npm run solve -- --replay
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

`dist/` 为完整静态产物，可由静态 HTTP 服务托管；不要通过 `file://` 打开。所有字体、音效和模型均不依赖远端下载；首次加载仍需要网络，本版不提供离线安装。

## 测试与验证

规则、输入、存档、物理、UI、音效和渲染边界使用 Vitest。`tests/level-solutions.json` 保存真实发射角度，`npm run solve -- --replay` 使用同一 Rapier 模拟和同一游戏状态机验证八关可通关，不伪造击落或解锁。

浏览器验收脚本位于 `scripts/browser-qa.py`，使用 Python Playwright 与 `/usr/bin/chromium`：

```bash
QA_URL=http://127.0.0.1:4173 python3 scripts/browser-qa.py
```

实际结果、截图及限制见 `docs/testing.md` 与 `artifacts/qa/`。`window.__tidal.inspect()` 只读查看状态与资源计数，没有修改分数或解锁的入口。支持 WebMCP 的浏览器还可通过正常开始、瞄准和发射动作操作游戏；不支持该能力的浏览器照常游玩。

## 技术结构

TypeScript + Vite；Three.js 渲染，Rapier WASM 模拟刚体，原生 DOM/CSS 界面和 Web Audio 合成音效。`src/game.ts` 是规则状态机，`simulation.ts` 管理物理世界，`levels.ts` 定义关卡；输入、渲染、界面、声音与存档各自独立。物理固定 60 Hz，快速炮弹使用连续碰撞检测。

运行时第三方依赖的许可证随静态产物交付：Three.js（MIT）和 Rapier（Apache-2.0），见 `public/licenses/`。构建提示的较大 JavaScript 分块主要来自内嵌 WASM；gzip 后约 1.82 MB，页面提供首次加载提示。

源码在 `soldier0929-ai/ai-game-one`，原始 `origin` 保留。`.openai/hosting.json` 只含私有 Sites 标识及静态目录，没有凭证。私有试玩入口可能要求平台身份验证；本项目没有扩大访问权限。

本项目在云端制作和验证，没有使用用户 Mac。浏览器触屏模拟并不等于真机测试；Safari/iOS 真机和真实手机性能须另行验证。
