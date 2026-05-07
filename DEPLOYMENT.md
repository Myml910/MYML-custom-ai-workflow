# MYML Canvas 单机云服务器部署指南

本文档描述 MYML Canvas + MYML-Matting-Engine 的第一版最小可用单机部署方案。

部署目标：

- Nginx 作为公网入口。
- 公网只开放 `80/443`。
- MYML Canvas Node server 监听 `127.0.0.1:3001`。
- MYML-Matting-Engine 监听 `127.0.0.1:8000`。
- Node server 托管前端 `dist/`、`/api` 和 `/library`。
- `/api/matting/remove-bg` 由 Canvas Node server 代理到 Matting Engine。
- 运行时数据统一放到 `/data/myml/library`。

## 1. 推荐目录结构

```bash
/opt/myml-canvas
  └── MYML-Canvas

/opt/myml-matting-engine
  └── MYML-Matting-Engine

/data/myml
  └── library
      ├── images
      ├── videos
      ├── workflows
      ├── chats
      ├── assets
      └── temp

/var/log/myml
  ├── canvas
  └── matting
```

创建目录：

```bash
sudo mkdir -p /opt/myml-canvas
sudo mkdir -p /opt/myml-matting-engine
sudo mkdir -p /data/myml/library/{images,videos,workflows,chats,assets,temp}
sudo mkdir -p /var/log/myml/canvas /var/log/myml/matting
sudo chown -R $USER:$USER /data/myml/library /var/log/myml
```

## 2. 安装基础环境

### Node.js

建议使用 Node.js 20 或更高版本。

```bash
node -v
npm -v
```

Ubuntu/Debian 可使用：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Python

建议 Python 3.10 或更高版本。

```bash
python3 --version
sudo apt install -y python3 python3-venv python3-pip
```

### Nginx 和 PM2

```bash
sudo apt install -y nginx
sudo npm install -g pm2
```

## 3. 部署 MYML Canvas

进入项目目录：

```bash
cd /opt/myml-canvas/MYML-Canvas
```

安装依赖并构建前端：

```bash
npm ci
npm run build
```

创建 `.env`：

```bash
nano .env
```

示例：

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3001

LIBRARY_DIR=/data/myml/library
MYML_MATTING_BASE_URL=http://127.0.0.1:8000

GEMINI_API_KEY=
KLING_ACCESS_KEY=
KLING_SECRET_KEY=
HAILUO_API_KEY=
OPENAI_API_KEY=
FAL_API_KEY=

CUSTOM_API_BASE_URL=
CUSTOM_API_KEY=
CUSTOM_NANO_BANANA_BASE_URL=
CUSTOM_NANO_BANANA_API_KEY=
CUSTOM_NANO_BANANA_MODEL=
CUSTOM_SEEDANCE_BASE_URL=
CUSTOM_SEEDANCE_API_KEY=
CUSTOM_SEEDANCE_MODEL=
CUSTOM_SEEDANCE_PUBLIC_BASE_URL=
PUBLIC_BASE_URL=
SERVER_PUBLIC_URL=

CHAT_API_KEY=
CHAT_API_BASE_URL=
CHAT_MODEL=
CHAT_REASONING_EFFORT=
CHAT_TOPIC_MODEL=

TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_CALLBACK_URL=https://your-domain.com/api/twitter/callback
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_TOKEN_SECRET=

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_CALLBACK_URL=https://your-domain.com/api/tiktok-post/callback

LOCAL_MODELS_DIR=
```

本地启动验证：

```bash
npm start
```

另开终端检查：

```bash
curl http://127.0.0.1:3001/
curl http://127.0.0.1:3001/api/library
```

## 4. 使用 PM2 管理 MYML Canvas

启动：

```bash
cd /opt/myml-canvas/MYML-Canvas
pm2 start npm --name myml-canvas -- start
```

查看状态和日志：

```bash
pm2 status
pm2 logs myml-canvas
```

设置开机自启：

```bash
pm2 save
pm2 startup
```

按 `pm2 startup` 输出的命令继续执行一次。

重启：

```bash
pm2 restart myml-canvas
```

更新部署：

```bash
cd /opt/myml-canvas/MYML-Canvas
git pull
npm ci
npm run build
pm2 restart myml-canvas
```

## 5. 部署 MYML-Matting-Engine

进入项目目录：

```bash
cd /opt/myml-matting-engine/MYML-Matting-Engine
```

创建 Python 虚拟环境并安装依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

启动验证：

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开终端检查：

```bash
curl http://127.0.0.1:8000/api/health
```

返回健康状态后，停止前台进程，继续配置 systemd。

## 6. 使用 systemd 管理 Matting Engine

创建服务文件：

```bash
sudo nano /etc/systemd/system/myml-matting.service
```

示例：

```ini
[Unit]
Description=MYML Matting Engine
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/myml-matting-engine/MYML-Matting-Engine
ExecStart=/opt/myml-matting-engine/MYML-Matting-Engine/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable myml-matting
sudo systemctl start myml-matting
```

查看状态和日志：

```bash
sudo systemctl status myml-matting
journalctl -u myml-matting -f
```

重启：

```bash
sudo systemctl restart myml-matting
```

## 7. Nginx 反向代理配置

创建配置：

```bash
sudo nano /etc/nginx/sites-available/myml-canvas
```

示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /library/ {
        proxy_pass http://127.0.0.1:3001/library/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/myml-canvas /etc/nginx/sites-enabled/myml-canvas
sudo nginx -t
sudo systemctl reload nginx
```

防火墙只开放公网入口：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3001/tcp
sudo ufw deny 8000/tcp
```

如果使用云厂商安全组，也只开放 `80/443`。

## 8. HTTPS 配置

如果使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

续期检查：

```bash
sudo certbot renew --dry-run
```

## 9. 数据目录 `/data/myml/library`

Canvas 通过 `.env` 中的 `LIBRARY_DIR` 使用持久化目录：

```env
LIBRARY_DIR=/data/myml/library
```

运行时数据包括：

- `images`: 图片生成、上传图片、工作流中提取出的图片
- `videos`: 视频生成、上传视频、TikTok 导入、视频裁剪
- `workflows`: 工作流 JSON
- `chats`: Chat session JSON
- `assets`: 用户创建的素材库
- `temp`: Twitter/TikTok 上传临时文件

检查权限：

```bash
ls -ld /data/myml/library
ls -ld /data/myml/library/images
```

修复权限：

```bash
sudo chown -R $USER:$USER /data/myml/library
```

旧数据迁移：

```bash
cp -a /opt/myml-canvas/MYML-Canvas/library/* /data/myml/library/
```

迁移后重启 Canvas：

```bash
pm2 restart myml-canvas
```

## 10. Matting 调用链路

前端请求：

```text
/api/matting/remove-bg
```

Canvas Node server 转发到：

```text
MYML_MATTING_BASE_URL/api/matting/remove-bg
```

默认：

```env
MYML_MATTING_BASE_URL=http://127.0.0.1:8000
```

检查 Matting Engine：

```bash
curl http://127.0.0.1:8000/api/health
```

检查 Canvas 到 Matting 的配置：

```bash
grep MYML_MATTING_BASE_URL /opt/myml-canvas/MYML-Canvas/.env
```

## 11. 常见问题排查

### 页面打不开

检查 Canvas：

```bash
pm2 status
pm2 logs myml-canvas
curl http://127.0.0.1:3001/
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### `/api` 请求失败

```bash
curl http://127.0.0.1:3001/api/library
curl http://your-domain.com/api/library
```

如果本机成功、域名失败，优先检查 Nginx `location /api/`。

### `/library/images/...` 404

检查文件是否存在：

```bash
ls /data/myml/library/images
```

检查 `.env`：

```bash
grep LIBRARY_DIR /opt/myml-canvas/MYML-Canvas/.env
```

重启 Canvas：

```bash
pm2 restart myml-canvas
```

### 上传或生成文件失败

检查目录权限：

```bash
ls -ld /data/myml/library
sudo chown -R $USER:$USER /data/myml/library
```

检查磁盘空间：

```bash
df -h
```

### Nginx 413 Request Entity Too Large

在 Nginx server 配置中确认：

```nginx
client_max_body_size 100M;
```

应用配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Matting 抠除背景失败

检查 Matting Engine：

```bash
curl http://127.0.0.1:8000/api/health
journalctl -u myml-matting -f
```

检查 Canvas 日志：

```bash
pm2 logs myml-canvas
```

### OAuth 回调失败

确认 `.env` 中的回调地址和平台后台完全一致：

```env
TWITTER_CALLBACK_URL=https://your-domain.com/api/twitter/callback
TIKTOK_CALLBACK_URL=https://your-domain.com/api/tiktok-post/callback
```

修改后重启：

```bash
pm2 restart myml-canvas
```

### 更新后仍看到旧前端

重新构建并重启：

```bash
cd /opt/myml-canvas/MYML-Canvas
npm ci
npm run build
pm2 restart myml-canvas
```

浏览器强制刷新或清理缓存。

## 12. 后续优化

### Nginx 直接托管 `dist`

当前最小方案由 Node server 托管 `dist`。后续可以改为：

- Nginx 直接托管 `/opt/myml-canvas/MYML-Canvas/dist`
- `/api/` 反代到 `127.0.0.1:3001`
- `/library/` 反代到 `127.0.0.1:3001`

这样静态资源吞吐更好，Node server 只负责 API。

### S3 / RustFS 对象存储

当前 `/library` 使用本机磁盘。后续可考虑：

- 图片、视频、素材文件写入 S3/RustFS
- workflow/chats metadata 继续本地或迁移数据库
- `/library/...` URL 改为对象存储 URL 或经服务端签名代理

第一版部署不接对象存储，避免增加复杂度。

### 权限登录

当前部署默认没有用户登录保护。公网部署建议后续加入：

- 账号登录
- 管理员权限
- API 鉴权
- Nginx basic auth 作为临时保护

### 日志和备份

建议定期备份：

```bash
/data/myml/library
/opt/myml-canvas/MYML-Canvas/.env
/opt/myml-matting-engine/MYML-Matting-Engine/.env
```

示例备份：

```bash
tar -czf /data/myml/backups/library-$(date +%F).tar.gz /data/myml/library
```

日志建议：

- Canvas: `pm2 logs myml-canvas`
- Matting: `journalctl -u myml-matting`
- Nginx: `/var/log/nginx/access.log` 和 `/var/log/nginx/error.log`
