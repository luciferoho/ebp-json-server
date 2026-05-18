# ebp-json-server

[electron-boilerplate-pure](https://github.com/Lucifer-s-Templates/electron-boilerplate-pure) 的 mock-api 服务

## 测试账号

- admin: lumos123
- lucifer: 123456

## 项目结构

```plaintext
ebp-json-server/
├── src/
│   ├── server.js              # 服务端入口文件
│   ├── db.json                # 数据配置文件
│   └── hash-password.js       # 密码哈希工具
├── .env                     # 环境变量配置
├── .env.development    # 开发环境变量配置
├── .env.production    # 生产环境变量配置
├── process.json             # pm2启动配置
└── package.json             # 项目依赖配置
```

## 本地运行

```bash
# 安装依赖
npm install

# 开发环境
npm run dev

# 生产环境
npm run prod
```

## 服务器上运行

```bash

# 使用pm2启动
pm2 start process.json

# 查看服务状态
pm2 list

# 重启服务
pm2 restart ebp-json-server

# 停止服务
pm2 stop ebp-json-server

# 删除服务
pm2 delete ebp-json-server

# 查看日志
pm2 logs ebp-json-server

# 保存并设置开机自启
pm2 save
pm2 startup

```

## 生成强密码的方法

```bash

# 使用 openssl 生成随机字符串
openssl rand -base64 32

# 把生成的随机字符串替换到 `.env` 文件中的 `JWT_SECRET`

```
