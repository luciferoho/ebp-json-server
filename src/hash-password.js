const bcrypt = require('bcryptjs')

// 要加密的密码
const password = 'lumos123'

// 生成加密密码
const salt = bcrypt.genSaltSync(10)
const hash = bcrypt.hashSync(password, salt)

console.log('原始密码:', password)
console.log('加密后:', hash)