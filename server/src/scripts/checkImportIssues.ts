import prisma from '../lib/prisma';

/**
 * 检查导入的课程数据，查找可能的问题
 */
async function checkImportIssues() {
  try {
    console.log('开始检查导入的课程数据...\n');
    
    // 查询所有导入的课程
    const schedules = await prisma.schedule.findMany({
      where: {
        source: 'import'
      },
      include: {
        computerRoom: true
      },
      orderBy: [
        { computerRoom: { roomNumber: 'asc' } },
        { dayOfWeek: 'asc' },
        { periodStart: 'asc' }
      ]
    });
    
    console.log(`总共找到 ${schedules.length} 条导入的课程记录\n`);
    
    // 检查问题
    const issues: Array<{
      type: string;
      schedule: any;
      message: string;
    }> = [];
    
    schedules.forEach(schedule => {
      // 检查周次是否有效
      if (schedule.weekStart <= 0 || schedule.weekEnd <= 0) {
        issues.push({
          type: '无效周次',
          schedule,
          message: `周次无效: weekStart=${schedule.weekStart}, weekEnd=${schedule.weekEnd}`
        });
      }
      
      // 检查周次范围是否合理
      if (schedule.weekStart > schedule.weekEnd) {
        issues.push({
          type: '周次范围错误',
          schedule,
          message: `周次范围错误: ${schedule.weekStart} > ${schedule.weekEnd}`
        });
      }
      
      // 检查节次是否有效
      if (schedule.periodStart <= 0 || schedule.periodEnd <= 0) {
        issues.push({
          type: '无效节次',
          schedule,
          message: `节次无效: periodStart=${schedule.periodStart}, periodEnd=${schedule.periodEnd}`
        });
      }
      
      // 检查节次范围是否合理
      if (schedule.periodStart > schedule.periodEnd) {
        issues.push({
          type: '节次范围错误',
          schedule,
          message: `节次范围错误: ${schedule.periodStart} > ${schedule.periodEnd}`
        });
      }
      
      // 检查是否有课程名或教师
      if (!schedule.courseName || schedule.courseName.trim() === '') {
        issues.push({
          type: '缺少课程名',
          schedule,
          message: '课程名为空'
        });
      }
      
      if (!schedule.teacher || schedule.teacher.trim() === '') {
        issues.push({
          type: '缺少教师',
          schedule,
          message: '教师为空'
        });
      }
    });
    
    // 显示问题
    if (issues.length === 0) {
      console.log('✅ 未发现明显问题！\n');
    } else {
      console.log(`⚠️  发现 ${issues.length} 个问题：\n`);
      
      // 按类型分组
      const issuesByType = new Map<string, typeof issues>();
      issues.forEach(issue => {
        if (!issuesByType.has(issue.type)) {
          issuesByType.set(issue.type, []);
        }
        issuesByType.get(issue.type)!.push(issue);
      });
      
      issuesByType.forEach((typeIssues, type) => {
        console.log(`\n【${type}】共 ${typeIssues.length} 条：`);
        typeIssues.forEach((issue, index) => {
          const s = issue.schedule;
          console.log(`  ${index + 1}. 机房: ${s.computerRoom.roomName || s.computerRoom.roomNumber}`);
          console.log(`     课程: ${s.courseName}`);
          console.log(`     教师: ${s.teacher}`);
          console.log(`     时间: 周${s.dayOfWeek} 第${s.periodStart}-${s.periodEnd}节 {${s.weekStart}-${s.weekEnd}周}`);
          console.log(`     问题: ${issue.message}`);
          console.log('');
        });
      });
    }
    
    // 统计信息
    console.log('\n=== 统计信息 ===');
    const roomCount = new Set(schedules.map(s => s.computerRoomId)).size;
    console.log(`机房数量: ${roomCount}`);
    console.log(`课程记录数: ${schedules.length}`);
    
    const weekRange = schedules.reduce((acc, s) => {
      return {
        min: Math.min(acc.min, s.weekStart),
        max: Math.max(acc.max, s.weekEnd)
      };
    }, { min: 999, max: 0 });
    console.log(`周次范围: 第${weekRange.min}-${weekRange.max}周`);
    
    const periodRange = schedules.reduce((acc, s) => {
      return {
        min: Math.min(acc.min, s.periodStart),
        max: Math.max(acc.max, s.periodEnd)
      };
    }, { min: 999, max: 0 });
    console.log(`节次范围: 第${periodRange.min}-${periodRange.max}节`);
    
  } catch (error) {
    console.error('检查过程中发生错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkImportIssues();

