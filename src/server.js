// 加载环境变量（放在最前面）
require('dotenv').config()

const express = require('express')
const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const cors = require('cors')

// 从环境变量读取配置
const DB_FILE = path.join(__dirname, 'db.json')
const PORT = process.env.PORT || 10001
const HOST = process.env.HOST || '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '7d'

// 检查必要的环境变量
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-change-this-in-production') {
	console.error('❌ 错误: 请在生产环境设置强密码的 JWT_SECRET 环境变量！')
	process.exit(1)
}

console.log(`✅ 环境: ${process.env.NODE_ENV || 'development'}`)

const server = express()

// 内存中的数据库
let db = {}

// ========== 辅助函数 ==========

// 统一包装响应格式
const wrapResponse = data => {
	if (
		data &&
		typeof data === 'object' &&
		data.hasOwnProperty('code') &&
		data.hasOwnProperty('msg') &&
		data.hasOwnProperty('data')
	) {
		return data
	}
	return {
		code: 200,
		msg: 'success',
		data: data,
	}
}

// 加载数据库
const loadDb = () => {
	try {
		db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
		console.log(`[${new Date().toLocaleTimeString()}] db.json loaded.`)
		return true
	} catch (error) {
		console.error(`[${new Date().toLocaleTimeString()}] Error loading db.json:`, error.message)
		return false
	}
}

const generateToken = user => {
	return jwt.sign(
		{
			id: user.id,
			username: user.username,
			role: user.role || 'user',
		},
		JWT_SECRET,
		{ expiresIn: TOKEN_EXPIRES_IN },
	)
}

const verifyToken = token => {
	try {
		return jwt.verify(token, JWT_SECRET)
	} catch (error) {
		return null
	}
}

const getTokenFromHeaders = req => {
	const authHeader = req.headers.authorization
	if (!authHeader) return null
	if (authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7)
	}
	return authHeader
}

const isPublicPath = req => {
	const publicPaths = ['/app/login', '/app/verify', '/app/logout']
	return publicPaths.some(path => req.path === path)
}

// 分页辅助函数
const paginate = (data, pageNum, pageSize) => {
	const start = (pageNum - 1) * pageSize
	const end = start + pageSize
	return data.slice(start, end)
}

// ========== 文件监听 ==========
const watcher = chokidar.watch(DB_FILE, {
	persistent: true,
	ignoreInitial: true,
	awaitWriteFinish: {
		stabilityThreshold: 100,
		pollInterval: 50,
	},
})

watcher.on('change', () => {
	console.log(`[${new Date().toLocaleTimeString()}] Detected db.json change, reloading...`)
	loadDb()
})

// ========== 1. 默认中间件 ==========
server.use(cors())
server.use(express.json())
server.use(express.urlencoded({ extended: true }))

// ========== 2. 公开接口（不需要鉴权） ==========

// 登录接口
server.post('/app/login', (req, res) => {
	const { username, password } = req.body

	if (!username || !password) {
		return res.status(200).json({
			code: 500,
			msg: '用户名和密码不能为空',
			data: null,
		})
	}

	const users = db.users || []
	const user = users.find(u => u.username === username)

	if (!user) {
		return res.status(200).json({
			code: 500,
			msg: '用户不存在',
			data: null,
		})
	}

	const isPasswordValid = bcrypt.compareSync(password, user.password)

	if (!isPasswordValid) {
		return res.status(200).json({
			code: 500,
			msg: '密码错误',
			data: null,
		})
	}

	const token = generateToken(user)

	res.json({
		code: 200,
		msg: '登录成功',
		data: {
			access_token: token,
		},
	})
})

// 验证 token 接口
server.get('/app/verify', (req, res) => {
	const token = getTokenFromHeaders(req)

	if (!token) {
		return res.status(401).json({
			code: 401,
			msg: '未提供 token',
			data: null,
		})
	}

	const decoded = verifyToken(token)

	if (!decoded) {
		return res.status(401).json({
			code: 401,
			msg: 'token 无效或已过期',
			data: null,
		})
	}

	res.json({
		code: 200,
		msg: 'token 有效',
		data: decoded,
	})
})

// 退出登录接口
server.post('/app/logout', (req, res) => {
	res.json({
		code: 200,
		msg: '退出成功',
		data: null,
	})
})

// ========== 3. 鉴权中间件（保护其他 /app/* 接口） ==========
server.use((req, res, next) => {
	// 只保护 /app/* 路径
	if (!req.path.startsWith('/app/')) {
		return next()
	}

	// 跳过公开路径
	if (isPublicPath(req)) {
		return next()
	}

	const token = getTokenFromHeaders(req)

	if (!token) {
		return res.status(401).json({
			code: 401,
			msg: '请先登录',
			data: null,
		})
	}

	const decoded = verifyToken(token)

	if (!decoded) {
		return res.status(401).json({
			code: 401,
			msg: 'token 无效或已过期，请重新登录',
			data: null,
		})
	}

	req.user = decoded
	next()
})

// ========== 4. 需要鉴权的查询接口 ==========

// 获取用户信息接口
server.get('/app/getInfo', (req, res) => {
	const users = db.users || []
	const user = users.find(u => u.id === req.user.id)

	if (!user) {
		return res.status(200).json({
			code: 500,
			msg: '用户不存在',
			data: null,
		})
	}

	const { password, ...userInfo } = user

	res.json(wrapResponse(userInfo))
})

// 修改用户基本信息接口
server.put('/app/user/profile', (req, res) => {
	const { orgId, groupName, mobile, email } = req.body
	const users = db.users || []
	const userIndex = users.findIndex(u => u.id === req.user.id)

	if (userIndex === -1) {
		return res.status(200).json({
			code: 500,
			msg: '用户不存在',
			data: null,
		})
	}

	// 更新允许修改的字段
	if (orgId !== undefined) users[userIndex].orgId = orgId
	if (groupName !== undefined) users[userIndex].groupName = groupName
	if (mobile !== undefined) users[userIndex].mobile = mobile
	if (email !== undefined) users[userIndex].email = email

	// 保存到文件
	try {
		fs.writeFileSync(DB_FILE, JSON.stringify(db, null, '\t'))
		const { password, ...userInfo } = users[userIndex]
		res.json(wrapResponse(userInfo))
	} catch (error) {
		res.status(200).json({
			code: 500,
			msg: '保存失败: ' + error.message,
			data: null,
		})
	}
})

// 修改密码接口
server.put('/app/user/password', (req, res) => {
	// 生产环境不允许修改密码
	if (process.env.NODE_ENV === 'production') {
		return res.status(200).json({
			code: 500,
			msg: '生产环境不允许修改密码',
			data: null,
		})
	}

	const { oldPassword, newPassword } = req.body

	if (!oldPassword || !newPassword) {
		return res.status(200).json({
			code: 500,
			msg: '原密码和新密码不能为空',
			data: null,
		})
	}

	const users = db.users || []
	const userIndex = users.findIndex(u => u.id === req.user.id)

	if (userIndex === -1) {
		return res.status(200).json({
			code: 500,
			msg: '用户不存在',
			data: null,
		})
	}

	// 验证原密码
	const isOldPasswordValid = bcrypt.compareSync(oldPassword, users[userIndex].password)
	if (!isOldPasswordValid) {
		return res.status(200).json({
			code: 500,
			msg: '原密码错误',
			data: null,
		})
	}

	// 加密新密码
	const salt = bcrypt.genSaltSync(10)
	users[userIndex].password = bcrypt.hashSync(newPassword, salt)

	// 保存到文件
	try {
		fs.writeFileSync(DB_FILE, JSON.stringify(db, null, '\t'))
		res.json(wrapResponse(null))
	} catch (error) {
		res.status(200).json({
			code: 500,
			msg: '保存失败: ' + error.message,
			data: null,
		})
	}
})

// 查询组织列表
server.get('/app/org', (req, res) => {
	const orgs = db.orgs || []
	res.json(wrapResponse(orgs))
})

// 查询软件文档
server.get('/app/getSoftwareDoc', (req, res) => {
	const softwareDoc = db.softwareDoc || null
	res.json(wrapResponse(softwareDoc))
})

// 查询软件安装包
server.get('/app/getSoftwareInstaller', (req, res) => {
	const softwareInstaller = db.softwareInstaller || null
	res.json(wrapResponse(softwareInstaller))
})

// 查询公告列表（支持分页）
server.get('/app/notice', (req, res) => {
	const { pageNum = 1, pageSize = 10 } = req.query
	let notices = db.notice || []

	// 按时间倒序排列
	notices = notices.sort((a, b) => b.createTime - a.createTime)

	// 分页
	const total = notices.length
	const rows = paginate(notices, parseInt(pageNum), parseInt(pageSize))

	res.json(
		wrapResponse({
			rows,
			total,
			page: parseInt(pageNum),
			size: parseInt(pageSize),
			last: notices.length <= parseInt(pageNum) * parseInt(pageSize) ? true : false,
		}),
	)
})

// 查询单个公告
server.get('/app/notice/:id', (req, res) => {
	const { id } = req.params
	const notices = db.notice || []
	const notice = notices.find(n => n.id === parseInt(id))

	if (!notice) {
		return res.status(404).json({
			code: 404,
			msg: '公告不存在',
			data: null,
		})
	}

	res.json(wrapResponse(notice))
})

// ========== 5. 加载数据库并启动服务器 ==========
if (loadDb()) {
	server.listen(PORT, HOST, () => {
		console.log(`\n🚀 Mock Server is running on http://${HOST}:${PORT}`)
		console.log(`\n📋 接口列表:`)
		console.log(`   POST   /app/login              - 登录（公开）`)
		console.log(`   GET    /app/verify             - 验证 token（公开）`)
		console.log(`   POST   /app/logout             - 退出登录（公开）`)
		console.log(`   GET    /app/getInfo            - 获取用户信息`)
		console.log(`   PUT    /app/user/profile       - 修改用户基本信息`)
		console.log(`   PUT    /app/user/password      - 修改密码（开发环境可用）`)
		console.log(`   GET    /app/org/list           - 查询组织列表`)
		console.log(`   GET    /app/getSoftwareDoc     - 查询软件文档`)
		console.log(`   GET    /app/getSoftwareInstaller - 查询软件安装包`)
		console.log(`   GET    /app/notice             - 查询公告列表（支持分页）`)
		console.log(`   GET    /app/notice/:id         - 查询单个公告`)
		console.log(`\n🌍 当前环境: ${process.env.NODE_ENV || 'development'}\n`)
	})
} else {
	console.error('❌ 无法加载数据库，服务器启动失败')
	process.exit(1)
}

// 优雅退出
process.on('SIGINT', () => {
	console.log('Shutting down...')
	watcher.close()
	process.exit(0)
})

process.on('SIGTERM', () => {
	console.log('Shutting down...')
	watcher.close()
	process.exit(0)
})
