# 国际象棋小游戏与网页联机版开发日志

## 项目信息
- AppID: wxe0765cfbb2f4ec3b
- 本地目录: D:\user\qi
- 服务器端口: 43879
- 微信基础库: 3.17.2

## 项目结构

```
D:\user\qi\
├── game.js                    # 入口文件
├── game.json                  # 游戏配置
├── project.config.json        # 项目配置
├── index.html                 # 网页联机版入口（GitHub Pages）
├── js/
│   ├── main.js                # 主逻辑（菜单、游戏循环、网络交互）
│   ├── board.js               # 棋盘+规则（选子、合法走法、状态管理）
│   ├── renderer.js            # Canvas渲染（棋盘、棋子、UI、高亮）
│   └── socket.js              # WebSocket客户端（连接、收发消息）
├── server/
│   ├── server.js              # WebSocket服务器（房间管理、走棋验证、将军/将杀检测）
│   ├── test.js                # 服务器测试脚本
│   └── package.json           # ws依赖
├── images/                    # 旧模板图片（可清理）
└── js/runtime/                # 旧模板文件（可清理）
```

## 已完成的功能

### 前端（微信小游戏）
- [x] Canvas棋盘渲染（棕色/浅色格子，Unicode棋子符号）
- [x] 菜单界面（开始游戏、等待、游戏结束）
- [x] 点击选子高亮（蓝色=合法走法，黄色=选中，红色=被将军，绿色=最后一步）
- [x] 兵升变选择界面
- [x] 回合提示（你的回合/对方回合）
- [x] 认输按钮
- [x] 微信转发邀请好友
- [x] 好友点卡片自动加入房间

### 后端（Node.js WebSocket）
- [x] 创建房间（6位随机房间号）
- [x] 加入房间
- [x] 走棋验证（所有棋子规则、不能送将）
- [x] 将军检测
- [x] 将杀/逼和检测
- [x] 断线处理（对手离开自动判赢）

### 游戏规则
- [x] 所有棋子移动规则（兵、车、马、象、后、王）
- [x] 吃子
- [x] 将军保护（不能走送将的棋）
- [x] 兵到底线升变（默认变后）
- [x] 将杀判赢
- [x] 逼和判平

## 待开发/待优化

### 优先
- [ ] 两位玩家完整对局回归（创建房间、分享链接、走棋、认输/结束）
- [ ] 断线重连
- [ ] 网页版兵升变选择（目前服务器默认升变为后）
- [ ] Render 休眠唤醒时的连接提示和重试

### 可选
- [ ] 吃过路兵
- [ ] 王车易位
- [ ] 悔棋功能
- [ ] 聊天消息
- [ ] 棋子移动动画
- [ ] 声音效果

## 关键技术点

### 微信小游戏注意事项
1. **Canvas初始化**: 必须用 `wx.createCanvas()` 获取，不能用全局 `canvas`
2. **es6: false**: project.config.json 中关闭ES6转译，代码全部用ES5语法（var、prototype）
3. **enhance: false**: 不启用Canvas增强模式
4. **disableUseStrict: true**: 关闭严格模式
5. **触摸坐标**: 小程序的 clientX/clientY 和 canvas 坐标是1:1，不需要额外缩放
6. **网页联机版**: `index.html` 使用浏览器 WebSocket 连接 Render 服务；棋盘显示可走提示由网页本地规则生成，服务器仍是走棋判定的权威来源

### 服务器启动
```bash
cd D:\user\qi\server
node server.js
```

### 联机流程
1. 玩家A打开游戏 → 点"开始游戏" → 自动创建房间
2. 点"邀请好友" → 微信转发给好友
3. 好友点卡片 → 自动加入房间 → 开始对战

### 网页版联机流程
1. 打开 GitHub Pages 网页并点击“创建房间”
2. 将页面生成的房间链接发给朋友，朋友打开链接后自动加入
3. 网页使用 WebSocket 与 Render 上的 Node.js 服务通信；双方走棋由服务端校验

## 已知问题
- 王车易位未实现
- 吃过路兵未实现
- 网页版和服务器端兵升变目前默认变后
- 没有断线重连；对局房间及棋盘保存在服务器内存中，服务重启/休眠恢复后房间不会保留
- Render 免费服务闲置后会休眠，首次连接可能要等待服务唤醒

## 网页联机版上线记录（2026-10-31）

- 网页地址：<https://lhw-gif.github.io/chess-game/>
- WebSocket 地址：`wss://chess-online-server-popz.onrender.com`
- 前端：根目录 `index.html`，托管在 GitHub Pages；通过 `?room=房间号` 自动加入房间
- 后端：`server/server.js` 部署在 Render Web Service，服务使用 `process.env.PORT || 43879` 监听端口
- Render 配置：仓库 `main` 分支自动部署，Root Directory 为 `server`，Build Command 为 `npm install`，Start Command 为 `node server.js`，Compute 规格为 Free
- 验证结果：Render 健康检查返回 HTTP 200（`Chess Server OK`）；网页与 Render WebSocket 连接成功
- Render 免费服务闲置后会休眠；重新连接时可能需要等待启动。服务端房间状态仅在内存中，实例重启后会丢失
- 集成测试：`node server/test.js` 可验证两名客户端完成 e2-e4 / e7-e5；本地验证通过

### 后续改进建议
1. **联机健壮性**：冷启动提示、连接超时区分、重试按钮、断线重连与房间恢复
2. **对局体验**：修复认输后的双方提示、提供升变选择、加入重新开局/返回大厅
3. **规则完整性**：实现王车易位、吃过路兵，并同步服务端与各客户端提示逻辑
4. **服务端状态**：明确实例重启时房间失效提示；如需保留对局，再考虑持久化
5. **移动端适配**：检查小屏幕棋盘尺寸、触控命中和横竖屏体验
6. **验证覆盖**：增加房间不存在/已满、非法走棋、将杀、逼和、断线和升变的自动化测试
