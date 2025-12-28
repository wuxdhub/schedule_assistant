import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function initUsers() {
  try {
    // 检查是否已有用户
    const existingUsers = await prisma.user.findMany();
    if (existingUsers.length > 0) {
      console.log('用户已存在，跳过初始化');
      return;
    }

    // 创建默认管理员用户
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
      }
    });

    console.log('✅ 默认管理员用户创建成功');
    console.log(`   用户名: admin`);
    console.log(`   密码: ${adminPassword}`);
    console.log(`   角色: 管理员`);

    console.log('\n📌 说明：');
    console.log('   - 普通用户无需账号密码，在前端选择"普通用户"即可直接进入');
    console.log('   - 只有管理员需要账号密码登录');

  } catch (error) {
    console.error('❌ 初始化用户失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

initUsers();

