# 坦克大战联机版 - 部署指南

## 目录结构

```
tank-battle-online/
├── server.js      # 服务器端代码
├── index.html     # 客户端页面
├── package.json   # Node.js依赖配置
└── README.md      # 本文档
```

---

## 第一部分：服务器端部署（Ubuntu 24.04）

### 步骤 1：更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

### 步骤 2：安装 Node.js

Ubuntu 24.04 默认的 Node.js 版本可能较旧，建议安装最新的 LTS 版本：

**方法 A：使用 NodeSource 仓库（推荐）**

```bash
# 安装 curl（如果未安装）
sudo apt install -y curl

# 添加 NodeSource 仓库（Node.js 20 LTS）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js
sudo apt install -y nodejs

# 验证安装
node --version
npm --version
```

**方法 B：使用 Ubuntu 默认仓库**

```bash
sudo apt install -y nodejs npm
node --version
```

### 步骤 3：上传游戏文件到服务器

**方法 A：使用 SCP（从本地电脑上传）**

在本地电脑上执行：
```bash
# 将整个文件夹上传到服务器
scp -r tank-battle-online/ username@你的服务器IP:/home/username/
```

**方法 B：使用 Git（如果代码在仓库中）**

```bash
# 在服务器上执行
cd /home/username
git clone <你的仓库地址>
cd tank-battle-online
```

**方法 C：手动创建文件**

```bash
# 在服务器上创建目录
mkdir -p /home/username/tank-battle-online
cd /home/username/tank-battle-online

# 创建文件（使用 nano 或 vim）
nano server.js    # 粘贴 server.js 的内容
nano index.html   # 粘贴 index.html 的内容
nano package.json # 粘贴 package.json 的内容
```

### 步骤 4：安装依赖

```bash
cd /home/username/tank-battle-online
npm install
```

### 步骤 5：配置防火墙

确保服务器防火墙开放 8080 端口：

```bash
# 使用 ufw（Ubuntu 默认防火墙）
sudo ufw allow 8080/tcp
sudo ufw status

# 或者使用 iptables
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### 步骤 6：启动服务器

**方法 A：直接运行（测试用）**

```bash
cd /home/username/tank-battle-online
node server.js
```

**方法 B：使用 PM2（推荐，生产环境）**

PM2 是一个进程管理器，可以让 Node.js 应用在后台持续运行，并在崩溃时自动重启。

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动游戏服务器
cd /home/username/tank-battle-online
pm2 start server.js --name tank-battle

# 查看运行状态
pm2 status

# 查看日志
pm2 logs tank-battle

# 设置开机自启动
pm2 startup
pm2 save
```

**PM2 常用命令：**
```bash
pm2 restart tank-battle   # 重启
pm2 stop tank-battle      # 停止
pm2 delete tank-battle    # 删除
pm2 logs tank-battle      # 查看日志
pm2 monit                 # 实时监控
```

### 步骤 7：验证服务器运行

服务器启动后，你应该看到类似以下输出：

```
========================================
  坦克大战联机服务器已启动
  端口: 8080
  访问: http://localhost:8080
========================================
```

---

## 第二部分：客户端访问

### 访问游戏

玩家在浏览器中访问：

```
http://你的服务器公网IP:8080
```

例如，如果你的服务器公网 IP 是 `123.45.67.89`，则访问：

```
http://123.45.67.89:8080
```

### 游戏流程

1. **第一个玩家** 打开页面，输入服务器地址（或使用默认），点击"连接"
2. 状态显示"等待对手加入..."
3. **第二个玩家** 打开页面，点击"连接"
4. 两个玩家自动匹配，游戏开始！
5. 使用方向键或 WASD 控制坦克移动，L 或空格键开火

---

## 第三部分：高级配置

### 修改端口

编辑 `server.js` 文件，修改第一行的 PORT：

```javascript
const PORT = process.env.PORT || 8080;  // 改为你想要的端口
```

或者使用环境变量：

```bash
PORT=3000 node server.js
# 或使用 PM2
pm2 start server.js --name tank-battle -- --port 3000
```

### 使用 Nginx 反向代理（可选）

如果你有域名，可以使用 Nginx 配置反向代理：

```bash
# 安装 Nginx
sudo apt install -y nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/tank-battle
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/tank-battle /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

现在可以通过域名访问：`http://your-domain.com`

### 配置 HTTPS（可选）

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 第四部分：故障排除

### 问题 1：无法连接服务器

**检查项：**
1. 服务器是否正在运行？`pm2 status` 或 `ps aux | grep node`
2. 端口是否开放？`sudo ufw status` 或 `sudo netstat -tlnp | grep 8080`
3. 防火墙是否允许该端口？
4. 云服务商的安全组是否开放端口？（阿里云、腾讯云、AWS等需要在控制台配置）

### 问题 2：连接后立即断开

**检查项：**
1. 查看服务器日志：`pm2 logs tank-battle`
2. 确认 WebSocket 协议正确（ws:// 或 wss://）

### 问题 3：游戏卡顿或延迟高

**解决方案：**
1. 检查服务器网络延迟：`ping 你的服务器IP`
2. 检查服务器负载：`top` 或 `htop`
3. 考虑使用更近的服务器节点

### 问题 4：端口被占用

```bash
# 查看端口占用
sudo lsof -i :8080

# 结束占用进程
sudo kill -9 <PID>
```

---

## 第五部分：快速命令参考

```bash
# 启动服务器
pm2 start server.js --name tank-battle

# 停止服务器
pm2 stop tank-battle

# 重启服务器
pm2 restart tank-battle

# 查看日志
pm2 logs tank-battle

# 查看状态
pm2 status

# 更新代码后重启
pm2 restart tank-battle
```

---

## 技术架构说明

### 通信协议

使用 WebSocket 进行实时双向通信：

- **客户端 → 服务器**：
  - `input`: 发送玩家输入状态（移动、开火）
  - `ready`: 准备开始下一局

- **服务器 → 客户端**：
  - `welcome`: 欢迎消息
  - `waiting`: 等待对手
  - `gameStart`: 游戏开始
  - `state`: 游戏状态同步（坦克位置、子弹、分数等）
  - `roundEnd`: 一局结束
  - `opponentLeft`: 对手离开

### 游戏逻辑

- 服务器权威模式：所有游戏逻辑在服务器端计算
- 客户端只负责渲染和发送输入
- 服务器以 60 FPS 的频率更新游戏状态并广播给所有玩家

---

## 联系与支持

如有问题，请检查服务器日志并参考故障排除部分。
