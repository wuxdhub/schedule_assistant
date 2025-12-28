/**
 * 生成标准格式的排课记录文本
 * 格式：课程名◇第X-Y节{周次范围}◇教师◇班级1;班级2
 */
export function formatScheduleText(
  courseName: string,
  periodStart: number,
  periodEnd: number,
  weekStart: number,
  weekEnd: number,
  teacher: string,
  classes: string[]
): string {
  const periodStr = periodStart === periodEnd 
    ? `第${periodStart}节` 
    : `第${periodStart}-${periodEnd}节`;
  
  const weekStr = weekStart === weekEnd
    ? `{${weekStart}周}`
    : `{${weekStart}-${weekEnd}周}`;
  
  const classesStr = classes.join(';');
  
  return `${courseName}◇${periodStr}${weekStr}◇${teacher}◇${classesStr}`;
}


