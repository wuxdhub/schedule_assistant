/**
 * 检查数据库中的课程数据
 */
import prisma from '../lib/prisma';

async function checkSchedules() {
  try {
    // 检查第二机房（A404）的课程
    const room = await prisma.computerRoom.findFirst({
      where: {
        OR: [
          { roomNumber: 'A404' },
          { roomName: { contains: '第二' } }
        ]
      },
      include: {
        schedules: {
          where: { status: 'active' },
          orderBy: [
            { weekStart: 'asc' },
            { dayOfWeek: 'asc' },
            { periodStart: 'asc' }
          ]
        }
      }
    });
    
    if (!room) {
      console.log('未找到第二机房');
      return;
    }
    
    console.log(`\n机房：${room.roomName || ''} ${room.roomNumber}`);
    console.log(`共有 ${room.schedules.length} 条课程记录：\n`);
    
    // 查找周一7-9节的课程
    const monday7to9 = room.schedules.filter(s => 
      s.dayOfWeek === 1 && 
      s.periodStart <= 9 && 
      s.periodEnd >= 7 &&
      s.weekStart <= 14 &&
      s.weekEnd >= 10
    );
    
    console.log('周一7-9节，10-14周的课程：');
    monday7to9.forEach(s => {
      console.log(`- ${s.courseName} | 第${s.periodStart}-${s.periodEnd}节 | {${s.weekStart}-${s.weekEnd}周} | ${s.teacher} | ${s.classes} | 来源:${s.source}`);
    });
    
    console.log(`\n所有课程：`);
    room.schedules.forEach(s => {
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      console.log(`${dayNames[s.dayOfWeek]} | 第${s.periodStart}-${s.periodEnd}节 | {${s.weekStart}-${s.weekEnd}周} | ${s.courseName} | ${s.teacher} | 来源:${s.source}`);
    });
    
    // 统计
    const imported = room.schedules.filter(s => s.source === 'import').length;
    const manual = room.schedules.filter(s => s.source === 'manual').length;
    console.log(`\n统计：导入${imported}条，手动预约${manual}条`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('检查失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkSchedules();

