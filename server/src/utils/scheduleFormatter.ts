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

/**
 * 解析标准格式的排课记录文本
 */
export function parseScheduleText(text: string): {
  courseName: string;
  periodStart: number;
  periodEnd: number;
  weekStart: number;
  weekEnd: number;
  teacher: string;
  classes: string[];
} | null {
  const parts = text.split('◇');
  if (parts.length < 4) {
    return null;
  }
  
  const courseName = parts[0].trim();
  const periodStr = parts[1].trim();
  const weekStr = parts[2].trim();
  const teacher = parts[3].trim();
  const classesStr = parts.slice(4).join('◇').trim();
  
  // 解析节次
  const periodMatch = periodStr.match(/(\d+)(?:-(\d+))?/);
  if (!periodMatch) return null;
  const periodStart = parseInt(periodMatch[1]);
  const periodEnd = periodMatch[2] ? parseInt(periodMatch[2]) : periodStart;
  
  // 解析周次
  const weekMatch = weekStr.match(/\{?(\d+)(?:-(\d+))?\}?/);
  if (!weekMatch) return null;
  const weekStart = parseInt(weekMatch[1]);
  const weekEnd = weekMatch[2] ? parseInt(weekMatch[2]) : weekStart;
  
  // 解析班级
  const classes = classesStr ? classesStr.split(';').map(c => c.trim()).filter(c => c) : [];
  
  return {
    courseName,
    periodStart,
    periodEnd,
    weekStart,
    weekEnd,
    teacher,
    classes
  };
}


