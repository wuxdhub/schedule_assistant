/**
 * 检查数据库中机房的roomName字段
 */
import prisma from '../lib/prisma';

async function checkRoomNames() {
  try {
    const rooms = await prisma.computerRoom.findMany({
      orderBy: { roomNumber: 'asc' }
    });
    
    console.log(`共有 ${rooms.length} 个机房：\n`);
    
    let hasRoomName = 0;
    let noRoomName = 0;
    
    rooms.forEach(room => {
      if (room.roomName) {
        console.log(`✓ ${room.roomNumber}: ${room.roomName}`);
        hasRoomName++;
      } else {
        console.log(`✗ ${room.roomNumber}: (无中文名称)`);
        noRoomName++;
      }
    });
    
    console.log(`\n统计：`);
    console.log(`- 有中文名称: ${hasRoomName} 个`);
    console.log(`- 无中文名称: ${noRoomName} 个`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('检查失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkRoomNames();

