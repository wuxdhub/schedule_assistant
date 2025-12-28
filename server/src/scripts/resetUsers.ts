import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function resetUsers() {
  try {
    console.log('开始重置用户...');

    // 删除所有现有用户
    const deletedCount = await prisma.user.deleteMany({});
    console.log(`已删除 ${deletedCount.count} 个用户`);

    // 创建默认管理员用户
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedAdminPassword,
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

    console.log('\n✅ 用户重置完成！');

  } catch (error) {
    console.error('❌ 重置用户失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetUsers();

