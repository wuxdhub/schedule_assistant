/**
 * 清理错误的机房数据
 * 删除那些机房号看起来像节次的数据（如"6-7节"、"8-9节"等）
 */
import prisma from '../lib/prisma';

async function cleanupRooms() {
  console.log('开始清理错误的机房数据...');
  
  // 查找所有机房
  const allRooms = await prisma.computerRoom.findMany();
  
  let deletedCount = 0;
  let keptCount = 0;
  
  for (const room of allRooms) {
    const roomNumber = room.roomNumber.trim();
    
    // 检查是否看起来像节次格式
    const isPeriodFormat = 
      roomNumber.includes('节') || 
      /^\d+-\d+节?$/.test(roomNumber) ||
      /^第\d+-\d+节$/.test(roomNumber) ||
      roomNumber === '晚' ||
      /^\d+节$/.test(roomNumber);
    
    if (isPeriodFormat) {
      console.log(`发现错误的机房数据: ${roomNumber}，准备删除...`);
      
      // 先删除相关的课程记录
      await prisma.schedule.deleteMany({
        where: { computerRoomId: room.id }
      });
      
      // 删除机房
      await prisma.computerRoom.delete({
        where: { id: room.id }
      });
      
      deletedCount++;
    } else {
      keptCount++;
    }
  }
  
  console.log(`清理完成！`);
  console.log(`- 删除错误数据: ${deletedCount} 条`);
  console.log(`- 保留有效数据: ${keptCount} 条`);
  
  await prisma.$disconnect();
}

// 运行清理
cleanupRooms().catch(console.error);

