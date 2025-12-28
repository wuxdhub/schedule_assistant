/**
 * 清理所有导入的课程记录
 */
import prisma from '../lib/prisma';

async function clearImportedSchedules() {
  try {
    const result = await prisma.schedule.deleteMany({
      where: { source: 'import' }
    });
    
    console.log(`已删除 ${result.count} 条导入的课程记录`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('清理失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

clearImportedSchedules();

