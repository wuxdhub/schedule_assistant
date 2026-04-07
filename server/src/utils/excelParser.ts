import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';
import crypto from 'crypto';
import fs from 'fs';

// Excel解析结果接口
export interface ExcelScheduleData {
  roomNumber: string;
  roomName?: string; // 机房中文名称
  capacity?: number;
  location?: string;
  courseName: string;
  teacher: string;
  classes: string;
  weekStart: number;
  weekEnd: number;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
}

/**
 * 解析周次字符串，支持多种格式：
 * - "14" -> {start: 14, end: 14}
 * - "14-16" -> {start: 14, end: 16}
 * - "14,15,16" -> 返回多个范围
 */
function parseWeekRange(weekStr: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  
  // 处理连续范围，如 "14-16周"
  const rangeMatch = weekStr.match(/(\d+)-(\d+)/);
  if (rangeMatch) {
    return [{ start: parseInt(rangeMatch[1]), end: parseInt(rangeMatch[2]) }];
  }
  
  // 处理单个周次，如 "14周"
  const singleMatch = weekStr.match(/(\d+)/);
  if (singleMatch) {
    const week = parseInt(singleMatch[1]);
    return [{ start: week, end: week }];
  }
  
  return [];
}

/**
 * 解析节次字符串，如 "第3-5节" -> {start: 3, end: 5}
 */
function parsePeriodRange(periodStr: string): { start: number; end: number } | null {
  const match = periodStr.match(/(\d+)-(\d+)/);
  if (match) {
    return { start: parseInt(match[1]), end: parseInt(match[2]) };
  }
  
  const singleMatch = periodStr.match(/(\d+)/);
  if (singleMatch) {
    const period = parseInt(singleMatch[1]);
    return { start: period, end: period };
  }
  
  return null;
}

/**
 * 解析星期几，如 "周一" -> 1, "周二" -> 2
 */
function parseDayOfWeek(dayStr: string): number | null {
  const dayMap: Record<string, number> = {
    '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7,
    '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 7,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7
  };
  
  for (const [key, value] of Object.entries(dayMap)) {
    if (dayStr.includes(key)) {
      return value;
    }
  }
  
  return null;
}

/**
 * 从机房标题中提取机房信息
 * 格式：第四微机室 (A406/64人) -> {roomName: "第四微机室", roomNumber: "A406", capacity: 64}
 */
function parseRoomInfo(titleText: string): { roomName?: string; roomNumber: string; capacity: number; location?: string } | null {
  // 匹配格式：第一微机室(A401/31人) 或 第四微机室 (A406/64人) 或 三机房（A403）
  // 注意：可能没有空格，如"第一微机室(A401/31人)"
  // 格式：机房名(机房号/容量人)
  const match1 = titleText.match(/(.+?)\s*[（(]([A-Z]?\d+)\/(\d+)人?[）)]/);
  if (match1) {
    const roomName = match1[1].trim();
    const roomNumber = match1[2];
    const capacity = match1[3] ? parseInt(match1[3]) : 50; // 默认50
    
    console.log(`[调试] parseRoomInfo匹配成功: roomName="${roomName}", roomNumber="${roomNumber}", capacity=${capacity}`);
    
    return {
      roomName: roomName || undefined,
      roomNumber: roomNumber,
      capacity: capacity
    };
  }
  
  // 尝试匹配没有"人"字的格式：第一微机室(A401/31)
  const match1b = titleText.match(/(.+?)\s*[（(]([A-Z]?\d+)[/）)](\d+)[）)]/);
  if (match1b) {
    const roomName = match1b[1].trim();
    const roomNumber = match1b[2];
    const capacity = parseInt(match1b[3]);
    
    console.log(`[调试] parseRoomInfo匹配成功(无"人"字): roomName="${roomName}", roomNumber="${roomNumber}", capacity=${capacity}`);
    
    return {
      roomName: roomName || undefined,
      roomNumber: roomNumber,
      capacity: capacity
    };
  }
  
  // 匹配格式：第四微机室 (A406/64人)
  const match2 = titleText.match(/(.+?)\s*\(([A-Z]?\d+)\/(\d+)人\)/);
  if (match2) {
    return {
      roomName: match2[1].trim() || undefined,
      roomNumber: match2[2],
      capacity: parseInt(match2[3])
    };
  }
  
  // 匹配格式：A406/64
  // 排除年份格式（如"2025/50"），年份通常是4位数字且没有字母前缀
  const match3 = titleText.match(/([A-Z]?\d+)\/(\d+)/);
  if (match3) {
    const roomNumber = match3[1];
    const capacity = parseInt(match3[2]);
    // 排除年份格式：如果是4位数字且没有字母前缀，很可能是年份，不是机房号
    // 机房号通常是3-4位数字，且可能有字母前缀（如A401），或者没有前缀但不会是4位纯数字
    if (roomNumber.length === 4 && !roomNumber.match(/^[A-Z]/)) {
      // 可能是年份，跳过
      return null;
    }
    // 验证机房号格式：应该是3-4位数字，或者有字母前缀
    if (roomNumber.match(/^[A-Z]?\d{3,4}$/)) {
      return {
        roomNumber: roomNumber,
        capacity: capacity
      };
    }
  }
  
  // 匹配格式：A406 (64人)
  const match4 = titleText.match(/([A-Z]?\d+)\s*\((\d+)人\)/);
  if (match4) {
    return {
      roomNumber: match4[1],
      capacity: parseInt(match4[2])
    };
  }
  
  return null;
}

/**
 * 解析标准格式的排课记录
 * 格式：国际贸易实务◇第3-5节{14-16周}◇霍雨佳◇国贸2301;国贸2302
 * 或：课程名 ◇第X-Y节 {X-Y周} ◇教师 ◇班级1;班级2
 */
function parseScheduleText(
  text: string,
  roomNumber: string,
  dayOfWeek: number,
  periodStart: number,
  periodEnd: number
): ExcelScheduleData[] {
  const results: ExcelScheduleData[] = [];
  
  // 一个单元格可能包含多个课程（用换行分隔）
  const courseTexts = text.split(/\n+/).map(t => t.trim()).filter(t => t);
  
  for (const courseText of courseTexts) {
    // 使用◇或◊分隔符分割（支持全角和半角）
    const parts = courseText.split(/[◇◊]/).map(p => p.trim());
    
    let courseName = '';
    let periodStr = '';
    let weekStr = '';
    let teacher = '';
    let classes = '';
    
    // 合并的特殊规则：统一处理"课程名◇教师◇节次◇周次"格式
    // 支持格式：
    // 1. "英语四六级口语考试◇教务处◇1-13节◇第12周"（单个周次）
    // 2. "码蹄杯周赛◇苗桂君◇11-13节◇第11,13-16周"（混合周次，包含逗号）
    // 3. "信号分析处理与实验上机考试◇苗桂君◇1-4节◇第16周"（单个周次）
    if (parts.length >= 4) {
      // 检查parts[2]是否包含节次格式（如"1-13节"、"11-13节"）
      const periodPart = parts[2] || '';
      const hasPeriodInPart2 = periodPart.match(/\d+[−-]\d+节/) !== null;
      
      // 检查parts[3]是否包含周次格式
      const weekPart = parts[3] || '';
      const hasWeekInPart3 = weekPart.match(/第?\d+/) !== null || weekPart.match(/\d+[−-]\d+/) !== null;
      
      // 如果parts[2]包含节次且parts[3]包含周次，则匹配此格式
      if (hasPeriodInPart2 && hasWeekInPart3) {
        // 提取基本信息
        // 格式：课程名◇教师◇节次◇周次
        courseName = parts[0].trim();
        teacher = parts[1] ? parts[1].trim() : '';
        classes = parts.length > 4 ? parts.slice(4).join(';').trim() : '';
        
        // 提取节次（从parts[2]）
        const periodMatch = parts[2] ? parts[2].match(/(\d+)[−-](\d+)节/) : null;
        if (periodMatch) {
          periodStr = `第${periodMatch[1]}-${periodMatch[2]}节`;
        }
        
        // 检查周次是否包含逗号（混合周次格式）
        const hasCommaInWeek = weekPart.includes(',') || weekPart.includes('，');
        
        if (hasCommaInWeek) {
          // 处理混合周次格式：如"第11,13-16周" -> 拆分成 11 和 13-16
          // 匹配格式：第11,13-16周 或 11,13-16周
          const mixedWeekMatch = weekPart.match(/第?\{?(\d+(?:[−-]\d+)?(?:[,，]\d+(?:[−-]\d+)?)+)周?\}?/);
          
          if (mixedWeekMatch) {
            const mixedWeekStr = mixedWeekMatch[1];
            const weekSegments = mixedWeekStr.split(/[,，]/).map(s => s.trim());
            
            for (const segment of weekSegments) {
              // 处理每个段：可能是单个数字（如"11"）或范围（如"13-16"）
              const rangeMatch = segment.match(/(\d+)(?:[−-](\d+))?/);
              if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = rangeMatch[2] ? parseInt(rangeMatch[2]) : start;
                
                // 为每个周次范围创建一条记录
                const period = parsePeriodRange(periodStr);
                const finalPeriodStart = period ? period.start : periodStart;
                const finalPeriodEnd = period ? period.end : periodEnd;
                
                const record = {
                  roomNumber,
                  courseName,
                  teacher: teacher || '',
                  classes: classes || '',
                  weekStart: start,
                  weekEnd: end,
                  dayOfWeek,
                  periodStart: finalPeriodStart,
                  periodEnd: finalPeriodEnd
                };
                
                results.push(record);
              }
            }
            
            // 跳过后续的标准解析流程
            continue;
          }
        } else {
          // 处理单个周次格式：如"第12周"、"第16周"
          const weekMatch = weekPart.match(/第?(\d+)周/);
          if (weekMatch) {
            weekStr = weekMatch[1] + '周';
          } else {
            // 尝试不带"周"字的格式
            const weekMatch2 = weekPart.match(/第?(\d+)/);
            if (weekMatch2) {
              weekStr = weekMatch2[1] + '周';
            }
          }
          
          console.log(`[合并特殊规则] 匹配成功: 课程="${courseName}", 教师="${teacher}", 节次="${periodStr}", 周次="${weekStr}"`);
          
          // 继续后续解析流程（周次解析、创建记录等）
          // 注意：这种格式通常没有classes字段，所以classes保持为空
        }
      } else {
        // 继续标准解析流程（标准格式，没有特殊规则匹配）
        courseName = parts[0].trim();
        
        // 检查parts[1]是否包含周次信息（包含{或}）
        if (parts[1].includes('{') || parts[1].includes('}')) {
          // parts[1]包含节次和周次，例如："第9-10节{1-4周,7-10周}"
          const periodMatch = parts[1].match(/第(\d+)-(\d+)节/);
          if (periodMatch) {
            periodStr = `第${periodMatch[1]}-${periodMatch[2]}节`;
          }
          // 支持格式：{6-11周,13-17周} 或 6-11周,13-17周}（缺少开头{）
          // 同时检查双周标记
          let weekMatch = parts[1].match(/\{([^}]+)\}/);
          if (weekMatch) {
            weekStr = weekMatch[1].trim();
          } else {
            // 尝试缺少开头{的格式：6-11周,13-17周}（只有结尾}）
            const brokenFormatMatch = parts[1].match(/(\d+[−-]\d+周(?:[,，]\d+[−-]\d+周)*)\}/);
            if (brokenFormatMatch) {
              weekStr = brokenFormatMatch[1];
            }
          }
          // parts[2]应该是教师，parts[3]及之后是班级
          teacher = parts[2] ? parts[2].trim() : '';
          classes = parts.length > 3 ? parts.slice(3).join(';').trim() : '';
        } else {
          // 标准格式：节次和周次分开
          // parts[1] = 节次，parts[2] = 周次，parts[3] = 教师，parts[4+] = 班级
          periodStr = parts[1].trim();
          weekStr = parts[2].trim();
          teacher = parts[3] ? parts[3].trim() : '';
          classes = parts.length > 4 ? parts.slice(4).join(';').trim() : '';
        }
      }
      
      // 非标准格式：如果parts.length >= 4但前面的规则都没匹配，尝试从整个文本中提取
      // 格式可能是：课程名第X-Y节{周次}教师班级
      // 例如：3D设计第1-4节{12-19周}赵昕国设2401
      // 注意：这段代码只在前面没有匹配到特殊规则且标准格式解析失败时执行
      if (!courseName || (!periodStr && !weekStr)) {
        // 提取课程名（在"第"或"◇"之前）
        const courseNameMatch = courseText.match(/^(.+?)(?:◇|第|\{)/);
        if (courseNameMatch) {
          courseName = courseNameMatch[1].trim();
        }
        
        // 提取节次
        const periodMatch = courseText.match(/第(\d+)-(\d+)节/);
        if (periodMatch) {
          periodStr = `第${periodMatch[1]}-${periodMatch[2]}节`;
        }
        
        // 提取周次（支持全角减号−和半角减号-）
        // 支持格式：{6-11周,13-17周} 或 6-11周,13-17周}（缺少开头{）
        let weekMatch = courseText.match(/\{([^}]+)\}/);
        if (weekMatch) {
          weekStr = weekMatch[1];
        } else {
          // 尝试缺少开头{的格式：6-11周,13-17周}
          const brokenFormatMatch = courseText.match(/(\d+[−-]\d+周(?:[,，]\d+[−-]\d+周)*)\}/);
          if (brokenFormatMatch) {
            weekStr = brokenFormatMatch[1];
          } else {
            // 尝试不带大括号的格式
            const weekMatch2 = courseText.match(/(\d+)[−-](\d+)周/);
            if (weekMatch2) {
              weekStr = `${weekMatch2[1]}-${weekMatch2[2]}周`;
            }
          }
        }
        
        // 提取教师（通常在周次之后，班级之前）
        // 尝试匹配：周次}教师 或 周次}[◇◊]教师 或 周次} 教师
        const teacherMatch = courseText.match(/\}[◇◊\s]*([^◇◊\d\s]+?)(?:[◇◊\s]*[A-Za-z0-9]|$)/);
        if (teacherMatch) {
          teacher = teacherMatch[1].trim();
        } else {
          // 如果找不到，尝试从文本末尾提取（在班级之前）
          // 匹配模式：教师名（中文，2-4个字）后面跟班级
          const teacherMatch2 = courseText.match(/([^◇◊\d\s]{2,4})(?:[◇◊\s]*[A-Za-z0-9]{2,}\d{4}|$)/);
          if (teacherMatch2) {
            teacher = teacherMatch2[1].trim();
          }
        }
        
        // 提取班级（通常是最后的字母数字组合，如：国设2401、材料2301;材料2302）
        const classMatch = courseText.match(/([A-Za-z\u4e00-\u9fa5]{1,}\d{4}(?:[;，,][A-Za-z\u4e00-\u9fa5]{1,}\d{4})*)/);
        if (classMatch) {
          classes = classMatch[1].replace(/[，,]/g, ';');
        }
      }
    } else if (parts.length < 4) {
      // 如果parts.length < 4，尝试从整个文本中提取（非标准格式）
      // 提取课程名（在"第"或"◇"之前）
      const courseNameMatch = courseText.match(/^(.+?)(?:◇|第|\{)/);
      if (courseNameMatch) {
        courseName = courseNameMatch[1].trim();
      }
      
      // 提取节次
      const periodMatch = courseText.match(/第(\d+)-(\d+)节/);
      if (periodMatch) {
        periodStr = `第${periodMatch[1]}-${periodMatch[2]}节`;
      }
      
      // 提取周次（支持全角减号−和半角减号-）
      // 支持格式：{6-11周,13-17周} 或 6-11周,13-17周}（缺少开头{）
      let weekMatch = courseText.match(/\{([^}]+)\}/);
      if (weekMatch) {
        weekStr = weekMatch[1];
      } else {
        // 尝试缺少开头{的格式：6-11周,13-17周}
        const brokenFormatMatch = courseText.match(/(\d+[−-]\d+周(?:[,，]\d+[−-]\d+周)*)\}/);
        if (brokenFormatMatch) {
          weekStr = brokenFormatMatch[1];
        } else {
          // 尝试不带大括号的格式
          const weekMatch2 = courseText.match(/(\d+)[−-](\d+)周/);
          if (weekMatch2) {
            weekStr = `${weekMatch2[1]}-${weekMatch2[2]}周`;
          }
        }
      }
      
      // 提取教师（通常在周次之后，班级之前）
      // 尝试匹配：周次}教师 或 周次}[◇◊]教师 或 周次} 教师
      const teacherMatch = courseText.match(/\}[◇◊\s]*([^◇◊\d\s]+?)(?:[◇◊\s]*[A-Za-z0-9]|$)/);
      if (teacherMatch) {
        teacher = teacherMatch[1].trim();
      } else {
        // 如果找不到，尝试从文本末尾提取（在班级之前）
        // 匹配模式：教师名（中文，2-4个字）后面跟班级
        const teacherMatch2 = courseText.match(/([^◇◊\d\s]{2,4})(?:[◇◊\s]*[A-Za-z0-9]{2,}\d{4}|$)/);
        if (teacherMatch2) {
          teacher = teacherMatch2[1].trim();
        }
      }
      
      // 提取班级（通常是最后的字母数字组合，如：国设2401、材料2301;材料2302）
      const classMatch = courseText.match(/([A-Za-z\u4e00-\u9fa5]{1,}\d{4}(?:[;，,][A-Za-z\u4e00-\u9fa5]{1,}\d{4})*)/);
      if (classMatch) {
        classes = classMatch[1].replace(/[，,]/g, ';');
      }
    }
    
    // 如果节次信息为空，尝试从整个文本中提取
    if (!periodStr || periodStr === '') {
      const periodMatch = courseText.match(/第?(\d+)[−-](\d+)节/);
      if (periodMatch) {
        periodStr = `第${periodMatch[1]}-${periodMatch[2]}节`;
      }
    }
    
    // 解析周次范围（支持多种格式，包括全角减号、多个范围等）
    // 同时提取双周标记（如：{8-16周(双)}）
    let isBiweekly = false; // 是否为双周课程
    if (weekStr.includes('(双)') || weekStr.includes('（双）')) {
      isBiweekly = true;
      // 移除双周标记，方便后续解析
      weekStr = weekStr.replace(/[（(]双[）)]/g, '').trim();
    }
    
    const weekRanges: Array<{ start: number; end: number }> = [];
    
    // 处理多个周次范围（用逗号分隔），例如：{1-4周,7-10周} 或 6-11周,13-17周}
    const weekParts = weekStr.split(/[,，]/).map(p => p.trim()).filter(p => p);
    
    for (const weekPart of weekParts) {
      // 先尝试匹配 {10-14周} 或 {10−14周} 格式（支持全角减号）
      let weekMatch = weekPart.match(/\{?(\d+)[−-](\d+)周?\}?/);
      if (weekMatch) {
        weekRanges.push({
          start: parseInt(weekMatch[1]),
          end: parseInt(weekMatch[2])
        });
      } else {
        // 尝试匹配 {10-14} 格式（只有大括号，没有"周"字）
        weekMatch = weekPart.match(/\{?(\d+)[−-](\d+)\}?/);
        if (weekMatch) {
          weekRanges.push({
            start: parseInt(weekMatch[1]),
            end: parseInt(weekMatch[2])
          });
        } else {
          // 尝试单个周次：14周 或 {14周}
          const singleWeekMatch = weekPart.match(/(\d+)周/) || weekPart.match(/\{(\d+)周?\}/);
          if (singleWeekMatch) {
            const week = parseInt(singleWeekMatch[1]);
            weekRanges.push({ start: week, end: week });
          } else {
            // 最后尝试：只提取数字范围，不要求"周"字
            weekMatch = weekPart.match(/(\d+)[−-](\d+)/);
            if (weekMatch) {
              weekRanges.push({
                start: parseInt(weekMatch[1]),
                end: parseInt(weekMatch[2])
              });
            }
          }
        }
      }
    }
    
    // 如果无法解析任何周次，尝试从整个文本中提取
    if (weekRanges.length === 0) {
      // 尝试从整个文本中提取周次信息（支持多个范围）
      // 支持格式：{6-11周,13-17周} 或 6-11周,13-17周}（缺少开头{）
      let weekContentMatch = courseText.match(/\{([^}]+)\}/);
      if (!weekContentMatch) {
        // 尝试缺少开头{的格式：6-11周,13-17周}（只有结尾}）
        weekContentMatch = courseText.match(/(\d+[−-]\d+周(?:[,，]\d+[−-]\d+周)*)\}/);
      }
      
      if (weekContentMatch) {
        let weekContent = weekContentMatch[1];
        // 检查是否包含双周标记
        if (weekContent.includes('(双)') || weekContent.includes('（双）')) {
          isBiweekly = true;
          // 移除双周标记
          weekContent = weekContent.replace(/[（(]双[）)]/g, '').trim();
        }
        // 分割多个周次范围
        const fallbackWeekParts = weekContent.split(/[,，]/).map(p => p.trim()).filter(p => p);
        for (const weekPart of fallbackWeekParts) {
          // 匹配范围：6-11周 或 13-17周
          const rangeMatch = weekPart.match(/(\d+)[−-](\d+)周?/);
          if (rangeMatch) {
            weekRanges.push({
              start: parseInt(rangeMatch[1]),
              end: parseInt(rangeMatch[2])
            });
          } else {
            // 匹配单周：19周 或 19
            const singleMatch = weekPart.match(/(\d+)周?/);
            if (singleMatch) {
              const week = parseInt(singleMatch[1]);
              weekRanges.push({ start: week, end: week });
            }
          }
        }
      }
      
      // 如果还是无法解析，尝试不带大括号的格式
      if (weekRanges.length === 0) {
        const noBraceMatch = courseText.match(/(\d+)[−-](\d+)周/);
        if (noBraceMatch) {
          weekRanges.push({
            start: parseInt(noBraceMatch[1]),
            end: parseInt(noBraceMatch[2])
          });
        } else {
          const singleNoBraceMatch = courseText.match(/(\d+)周/);
          if (singleNoBraceMatch) {
            const week = parseInt(singleNoBraceMatch[1]);
            weekRanges.push({ start: week, end: week });
          } else {
            console.warn(`无法解析周次: "${weekStr}", 课程: ${courseName}, 完整文本: ${courseText}`);
            continue; // 无法解析周次，跳过
          }
        }
      }
    }
    
    // 解析节次（优先使用文本中的节次，如果文本中的节次与行标题不一致）
    let finalPeriodStart = periodStart;
    let finalPeriodEnd = periodEnd;
    
    if (periodStr) {
      const period = parsePeriodRange(periodStr);
      if (period) {
        // 使用文本中的节次（更准确）
        finalPeriodStart = period.start;
        finalPeriodEnd = period.end;
      }
    }
    
    // 验证必要字段：课程名是必需的，教师名可以为空
    if (!courseName) {
      console.warn(`课程信息不完整: 课程名为空, 完整文本: ${courseText}`);
      continue;
    }
    
    // 如果没有教师名，记录警告但不跳过（允许教师名为空的情况）
    if (!teacher) {
      console.warn(`课程信息不完整: 教师名为空, 课程: ${courseName}, 完整文本: ${courseText}`);
      // 不跳过，允许教师名为空
    }
    
    // 为每个周次范围创建一条记录
    for (const weekRange of weekRanges) {
      // 如果有双周标记，在课程名称后添加标记
      let displayCourseName = courseName;
      if (isBiweekly) {
        displayCourseName = `${courseName}（双周）`;
      }
      
      const record = {
        roomNumber,
        courseName: displayCourseName, // 在课程名称中添加双周标记
        teacher: teacher || '', // 确保教师名不为undefined
        classes: classes || '', // 确保班级不为undefined
        weekStart: weekRange.start,
        weekEnd: weekRange.end,
        dayOfWeek,
        periodStart: finalPeriodStart,
        periodEnd: finalPeriodEnd
      };
      
      // 特别记录11-13节的课程
      if (finalPeriodStart >= 11 || finalPeriodEnd >= 11) {
        console.log(`[成功解析] 11-13节课程: 机房=${roomNumber}, 星期=${dayOfWeek}, 节次=${finalPeriodStart}-${finalPeriodEnd}, 课程="${courseName}", 教师="${teacher || '(空)'}", 班级="${classes || '(空)'}", 周次=${weekRange.start}-${weekRange.end}`);
      }
      
      results.push(record);
    }
  }
  
  return results;
}

/**
 * 根据表头名称查找列索引
 */
function findColumnIndex(headers: any[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim().toLowerCase();
    for (const keyword of keywords) {
      if (header.includes(keyword.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * 解析Excel文件并提取课程信息
 * 支持两种格式：
 * 1. 标准表格格式（列式）：机房号、课程名、教师等各占一列
 * 2. 课表格式（矩阵式）：行是节次，列是星期，单元格包含课程信息
 */
export async function parseExcelFile(filePath: string): Promise<ExcelScheduleData[]> {
  const workbook = XLSX.readFile(filePath);
  const results: ExcelScheduleData[] = [];
  
  // 遍历所有工作表
  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (data.length < 2) {
      return;
    }
    
    // 尝试识别表格格式
    const firstRow = data[0] as any[];
    const secondRow = data[1] as any[];
    
    // 检查是否是课表格式（矩阵式）
    // 特征：第一行可能包含机房信息，第二行开始是星期标题（周一、周二等）
    const isScheduleFormat = 
      firstRow.some((cell: any) => {
        const cellStr = String(cell || '').toLowerCase();
        return cellStr.includes('微机室') || cellStr.includes('机房') || cellStr.includes('机室');
      }) ||
      secondRow.some((cell: any) => {
        const cellStr = String(cell || '').trim();
        return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].includes(cellStr);
      });
    
    if (isScheduleFormat) {
      // 解析课表格式（传入 sheet 名以便从中解析容量）
      parseScheduleFormat(sheetName, data as any[][], results);
    } else {
      // 解析标准表格格式
      parseStandardFormat(data as any[][], results);
    }
  });
  
  return results;
}

/**
 * 解析课表格式（矩阵式）
 */
function parseScheduleFormat(sheetName: string, data: any[][], results: ExcelScheduleData[]): void {
  console.log(`[调试] 开始解析工作表，共 ${data.length} 行`);
  
  // 先输出前10行的所有内容，帮助调试
  console.log('[调试] 前10行内容预览:');
  for (let rowIdx = 0; rowIdx < Math.min(10, data.length); rowIdx++) {
    const row = data[rowIdx];
    if (row && row.length > 0) {
      const rowContent = row.map((c, idx) => {
        const cellStr = String(c || '').trim();
        return `列${idx + 1}:"${cellStr}"`;
      }).join(' | ');
      console.log(`  [调试] 行${rowIdx + 1}: ${rowContent}`);
    }
  }
  
  // 查找机房信息（通常在标题行，扩大搜索范围到前10行）
  let roomInfo: { roomName?: string; roomNumber: string; capacity: number; location?: string } | null = null;
  
  // 先尝试在前10行中查找
  for (let rowIdx = 0; rowIdx < Math.min(10, data.length); rowIdx++) {
    const row = data[rowIdx];
    if (!row) continue;
    
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx];
      const cellStr = String(cell || '').trim();
      
      // 检查是否包含机房相关关键词（优先匹配明确的机房信息）
      // 必须包含"微机室"、"机房"、"机室"等关键词
      const hasRoomKeyword = cellStr.includes('微机室') || cellStr.includes('机房') || cellStr.includes('机室');
      
      // 排除明显不是机房信息的内容（如"2025-2026学年第1学期机房上机课表"）
      const isNotRoomInfo = cellStr.includes('学年') || cellStr.includes('学期') || cellStr.includes('课表') || cellStr.includes('上机');
      
      // 只有明确包含机房关键词且不是标题的单元格才被认为是机房信息
      const isRoomRelated = hasRoomKeyword && !isNotRoomInfo;
      
      // 调试：记录所有非空单元格，帮助定位问题
      if (cellStr && cellStr.length > 0 && rowIdx < 5) {
        console.log(`[调试] 检查单元格: 行${rowIdx + 1}, 列${colIdx + 1}, 内容="${cellStr}", hasRoomKeyword=${hasRoomKeyword}, isNotRoomInfo=${isNotRoomInfo}, isRoomRelated=${isRoomRelated}`);
      }
      
      if (isRoomRelated) {
        console.log(`[调试] 找到可能的机房信息: 行${rowIdx + 1}, 列${colIdx + 1}, 内容="${cellStr}"`);
        roomInfo = parseRoomInfo(cellStr);
        if (roomInfo) {
          console.log(`[调试] 成功解析机房信息: ${roomInfo.roomName || ''} (${roomInfo.roomNumber})`);
          break;
        } else {
          // 如果parseRoomInfo返回null，尝试直接提取机房号
          // 排除年份（4位纯数字，如2025）
          const roomNumberMatch = cellStr.match(/([A-Z]?\d{3,4})/);
          if (roomNumberMatch) {
            const roomNumber = roomNumberMatch[1];
            // 排除年份：如果是4位纯数字且没有字母前缀，很可能是年份
            if (roomNumber.length === 4 && !roomNumber.match(/^[A-Z]/)) {
              console.log(`[调试] 跳过可能的年份: "${roomNumber}"`);
              continue;
            }
            // 尝试从上下文中提取机房名称
            let roomName = '';
            if (cellStr.includes('第十二')) {
              roomName = '第十二微机室';
            } else if (cellStr.includes('第十一')) {
              roomName = '第十一微机室';
            } else if (cellStr.includes('第十')) {
              roomName = '第十微机室';
            } else if (cellStr.match(/第[一二三四五六七八九十]+/)) {
              const nameMatch = cellStr.match(/(第[一二三四五六七八九十]+[微机室机房]+)/);
              if (nameMatch) {
                roomName = nameMatch[1];
              }
            }
            
            roomInfo = {
              roomName: roomName || undefined,
              roomNumber: roomNumber,
              capacity: 50 // 默认容量
            };
            console.log(`[调试] 使用备用方法解析机房信息: ${roomInfo.roomName || ''} (${roomInfo.roomNumber})`);
            break;
          } else {
            console.log(`[调试] 无法从"${cellStr}"中提取机房号`);
          }
        }
      }
    }
    if (roomInfo) break;
  }
  
  if (!roomInfo) {
    console.warn('[警告] 未找到机房信息，尝试仅根据 sheet 名解析机房号和容量');
    // 尝试从 sheet 名中识别容量，如 "第一机室31" => 容量 31
    const capMatch = sheetName.match(/(\d+)\s*$/);
    const capacityFromSheet = capMatch ? parseInt(capMatch[1], 10) : 50;
    roomInfo = {
      roomNumber: sheetName,
      capacity: Number.isNaN(capacityFromSheet) ? 50 : capacityFromSheet
    };
  } else {
    // 如果 sheet 名中带有容量信息（如 "第一机室31"），优先使用 sheet 名中的容量覆盖默认值
    const capMatch = sheetName.match(/(\d+)\s*$/);
    if (capMatch) {
      const capacityFromSheet = parseInt(capMatch[1], 10);
      if (!Number.isNaN(capacityFromSheet)) {
        roomInfo.capacity = capacityFromSheet;
      }
    }
  }
  
  // 查找星期列标题行（通常包含"周一"、"周二"等）
  let dayHeaderRowIdx = -1;
  const dayHeaders: number[] = []; // 存储星期对应的列索引
  
  for (let rowIdx = 0; rowIdx < Math.min(5, data.length); rowIdx++) {
    const row = data[rowIdx];
    const foundDays: number[] = [];
    
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellStr = String(row[colIdx] || '').trim();
      const dayMap: Record<string, number> = {
        '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7,
        '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 7
      };
      
      if (dayMap[cellStr]) {
        foundDays.push(dayMap[cellStr]);
        dayHeaders[colIdx] = dayMap[cellStr];
      }
    }
    
    if (foundDays.length >= 5) { // 至少找到5个星期
      dayHeaderRowIdx = rowIdx;
      break;
    }
  }
  
  if (dayHeaderRowIdx === -1) {
    console.warn('未找到星期标题行，跳过此工作表');
    return;
  }
  
  // 从星期标题行的下一行开始解析数据
  for (let rowIdx = dayHeaderRowIdx + 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    if (!row || row.length === 0) continue;
    
    // 第一列通常是节次信息
    const periodCell = String(row[0] || '').trim();
    if (!periodCell || periodCell === '') continue;
    
    // 特殊处理"晚"这一行，通常表示11-13节
    let period: { start: number; end: number } | null = null;
    if (periodCell === '晚' || periodCell.includes('晚')) {
      period = { start: 11, end: 13 };
      console.log(`[调试] 识别"晚"行，设置为11-13节`);
    } else {
      // 解析节次（如"1-2节"、"3-4节"、"5节"等）
      period = parsePeriodRange(periodCell);
      
      if (!period) {
        // 尝试其他格式
        const periodMatch = periodCell.match(/(\d+)-(\d+)/);
        if (periodMatch) {
          period = {
            start: parseInt(periodMatch[1]),
            end: parseInt(periodMatch[2])
          };
        } else {
          const singleMatch = periodCell.match(/(\d+)/);
          if (singleMatch) {
            const p = parseInt(singleMatch[1]);
            period = { start: p, end: p };
          } else {
            // 调试日志：记录无法解析的节次
            if (roomInfo.roomNumber === 'A308') {
              console.log(`[调试] 跳过行${rowIdx + 1}: 无法解析节次 "${periodCell}"`);
            }
            continue; // 无法解析节次，跳过此行
          }
        }
      }
    }
    
      // 调试日志：记录解析的节次（针对所有机房，但详细程度不同）
      const isDebugRoom = roomInfo.roomNumber === 'A308';
      // 特别关注11-13节的课程
      const isEveningPeriod = period.start >= 11 || period.end >= 11;
      
      if (isDebugRoom || isEveningPeriod) {
        console.log(`[调试] 解析行${rowIdx + 1}: 节次=${period.start}-${period.end}, 第一列内容="${periodCell}", 机房=${roomInfo.roomNumber}`);
      }
      
      // 遍历星期列（从第二列开始）
      for (let colIdx = 1; colIdx < row.length; colIdx++) {
        const dayOfWeek = dayHeaders[colIdx];
        if (!dayOfWeek) continue; // 不是星期列，跳过
        
        const cellContent = String(row[colIdx] || '').trim();
        if (!cellContent || cellContent === '') continue;
        
        // 调试日志：记录单元格内容（针对A308机房、周一、或11-13节的课程）
        const shouldLog = isDebugRoom || (isEveningPeriod && (dayOfWeek === 3 || dayOfWeek === 4));
        if (shouldLog) {
          console.log(`[调试] 单元格[行${rowIdx + 1}, 列${colIdx}]: 节次=${period.start}-${period.end}, 星期=${dayOfWeek}, 内容="${cellContent}"`);
        }
        
        // 解析单元格中的课程信息
        const scheduleData = parseScheduleText(
          cellContent,
          roomInfo.roomNumber,
          dayOfWeek,
          period.start,
          period.end
        );
        
        // 调试日志：记录解析结果（特别关注11-13节的课程）
        const shouldLogResult = shouldLog || (isEveningPeriod && (dayOfWeek === 3 || dayOfWeek === 4));
        
        if (shouldLogResult) {
          console.log(`[调试] 解析结果: 找到 ${scheduleData.length} 条记录, 节次=${period.start}-${period.end}, 星期=${dayOfWeek}`);
          if (scheduleData.length === 0) {
            console.warn(`[警告] 解析失败: 节次=${period.start}-${period.end}, 星期=${dayOfWeek}, 内容="${cellContent}"`);
          }
          scheduleData.forEach((item, idx) => {
            console.log(`[调试]   记录${idx + 1}: 课程="${item.courseName}", 教师="${item.teacher || '(空)'}", 班级="${item.classes || '(空)'}", 节次=${item.periodStart}-${item.periodEnd}, 周次=${item.weekStart}-${item.weekEnd}`);
          });
        }
        
        // 为每条记录添加机房中文名称和容量（容量来自标题或 sheet 名）
        scheduleData.forEach(item => {
          item.roomName = roomInfo!.roomName;
          item.capacity = roomInfo!.capacity;
        });
        
        results.push(...scheduleData);
      }
  }
}

/**
 * 解析标准表格格式（列式）
 */
function parseStandardFormat(data: any[][], results: ExcelScheduleData[]): void {
  if (data.length < 2) return;
  
  // 第一行是表头
  const headers = data[0] as any[];
  
  // 根据表头名称查找各列的索引
  const roomNumberIndex = findColumnIndex(headers, ['机房', '机房号', 'room', 'roomnumber']);
  const courseNameIndex = findColumnIndex(headers, ['课程', '课程名称', 'course', 'coursename']);
  const teacherIndex = findColumnIndex(headers, ['教师', '授课教师', 'teacher', '教师名']);
  const classesIndex = findColumnIndex(headers, ['班级', '上课班级', 'class', 'classes', '学生']);
  const weekIndex = findColumnIndex(headers, ['周次', '周', 'week', 'weeks']);
  const dayIndex = findColumnIndex(headers, ['星期', '周几', 'day', 'dayofweek', '日期']);
  const periodIndex = findColumnIndex(headers, ['节次', '节', 'period', 'time', '时间段']);
  const capacityIndex = findColumnIndex(headers, ['容量', '座位', 'capacity', 'seats', '人数']);
  const locationIndex = findColumnIndex(headers, ['位置', '地点', 'location', '地址']);
  
  // 如果找不到关键列，使用默认位置（向后兼容）
  const defaultRoomIndex = roomNumberIndex >= 0 ? roomNumberIndex : 0;
  const defaultCourseIndex = courseNameIndex >= 0 ? courseNameIndex : 1;
  const defaultTeacherIndex = teacherIndex >= 0 ? teacherIndex : 2;
  const defaultClassesIndex = classesIndex >= 0 ? classesIndex : 3;
  const defaultWeekIndex = weekIndex >= 0 ? weekIndex : 4;
  const defaultDayIndex = dayIndex >= 0 ? dayIndex : 5;
  const defaultPeriodIndex = periodIndex >= 0 ? periodIndex : 6;
  
  // 从第二行开始解析数据
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    
    // 跳过空行
    if (!row || row.length === 0) {
      continue;
    }
    
    try {
      const roomNumber = String(row[defaultRoomIndex] || '').trim();
      const courseName = String(row[defaultCourseIndex] || '').trim();
      const teacher = String(row[defaultTeacherIndex] || '').trim();
      const classes = String(row[defaultClassesIndex] || '').trim();
      const weekStr = String(row[defaultWeekIndex] || '').trim();
      const dayStr = String(row[defaultDayIndex] || '').trim();
      const periodStr = String(row[defaultPeriodIndex] || '').trim();
      const capacity = capacityIndex >= 0 && row[capacityIndex] ? parseInt(String(row[capacityIndex])) : undefined;
      const location = locationIndex >= 0 && row[locationIndex] ? String(row[locationIndex]).trim() : undefined;
      
      // 验证必填字段
      if (!roomNumber || !courseName) {
        continue;
      }
      
      // 验证机房号不是节次格式（如果看起来像节次，跳过）
      if (periodStr && (roomNumber.includes('节') || roomNumber.match(/^\d+-\d+节?$/))) {
        console.warn(`第${i + 1}行：机房号看起来像节次，跳过: ${roomNumber}`);
        continue;
      }
      
      // 解析周次
      const weekRanges = parseWeekRange(weekStr);
      if (weekRanges.length === 0) {
        continue;
      }
      
      // 解析星期
      const dayOfWeek = parseDayOfWeek(dayStr);
      if (!dayOfWeek) {
        continue;
      }
      
      // 解析节次
      const period = parsePeriodRange(periodStr);
      if (!period) {
        continue;
      }
      
      // 为每个周次范围创建一条记录
      weekRanges.forEach((weekRange) => {
        results.push({
          roomNumber,
          capacity,
          location,
          courseName,
          teacher,
          classes,
          weekStart: weekRange.start,
          weekEnd: weekRange.end,
          dayOfWeek,
          periodStart: period.start,
          periodEnd: period.end
        });
      });
    } catch (error) {
      console.error(`解析第${i + 1}行数据时出错:`, error);
    }
  }
}

/**
 * 将解析的数据导入数据库（优化版本，使用批量操作）
 */
/**
 * 计算文件哈希值（用于检测重复导入）
 */
export function calculateFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

/**
 * 检查文件是否已导入过
 */
export async function checkFileImported(fileHash: string): Promise<{ imported: boolean; version?: any }> {
  const version = await prisma.scheduleVersion.findFirst({
    where: { fileHash },
    orderBy: { createdAt: 'desc' }
  });
  
  return {
    imported: !!version,
    version: version || undefined
  };
}

/**
 * 获取最新版本号
 */
async function getNextVersionNumber(): Promise<number> {
  const latestVersion = await prisma.scheduleVersion.findFirst({
    orderBy: { version: 'desc' }
  });
  
  return latestVersion ? latestVersion.version + 1 : 1;
}

export async function importSchedulesToDatabase(
  rawData: ExcelScheduleData[],
  filePath?: string,
  fileName?: string,
  options?: {
    version?: number;
    semester?: string;
    isActive?: boolean;
    description?: string;
  }
): Promise<{ success: number; failed: number; versionId?: string }> {
  let success = 0;
  let failed = 0;
  let versionId: string | undefined;

  // 先在内存中按关键字段去重，避免同一门课因为跨节次行被解析两次
  // 去重键包含：机房、课程名、教师、班级、周次范围、星期、节次范围
  const uniqueMap = new Map<string, ExcelScheduleData>();
  for (const item of rawData) {
    const key = [
      item.roomNumber,
      item.courseName,
      item.teacher || '',
      item.classes || '',
      item.weekStart,
      item.weekEnd,
      item.dayOfWeek,
      item.periodStart,
      item.periodEnd
    ].join('|');
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }
  const data = Array.from(uniqueMap.values());

  if (data.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  try {
    // 使用外部传入的版本号，否则自动递增
    const nextVersion = options?.version ?? await getNextVersionNumber();
    let fileHash: string | null = null;

    if (filePath) {
      fileHash = calculateFileHash(filePath);
    }

    const version = await prisma.scheduleVersion.create({
      data: {
        version: nextVersion,
        semester: options?.semester || null,
        isActive: options?.isActive ?? false,
        fileName: fileName || 'unknown.xlsx',
        originalFilePath: filePath || null,
        fileHash: fileHash,
        description: options?.description || null,
        recordCount: 0
      }
    });
    
    versionId = version.id;
    console.log(`[版本管理] 创建新版本: v${version.version} (ID: ${versionId})`);
    // 第一步：收集所有唯一的机房号
    const uniqueRoomNumbers = [...new Set(data.map(item => item.roomNumber))];
    
    // 第二步：批量查询所有机房
    const existingRooms = await prisma.computerRoom.findMany({
      where: {
        roomNumber: { in: uniqueRoomNumbers }
      }
    });
    
    const existingRoomMap = new Map(existingRooms.map(room => [room.roomNumber, room]));
    const roomsToCreate: Array<{ roomNumber: string; roomName?: string; capacity: number; location?: string }> = [];
    const roomsToUpdate: Array<{ id: string; roomName?: string; capacity?: number }> = [];
    
    // 第三步：准备需要创建和更新的机房
    for (const roomNumber of uniqueRoomNumbers) {
      const item = data.find(d => d.roomNumber === roomNumber);
      if (!item) continue;
      
      const existingRoom = existingRoomMap.get(roomNumber);
      if (!existingRoom) {
        // 需要创建
        roomsToCreate.push({
          roomNumber: item.roomNumber,
          roomName: item.roomName,
          capacity: item.capacity || 50,
          location: item.location || ''
        });
      } else {
        // 检查是否需要更新
        const updateData: any = {};
        if (item.capacity && existingRoom.capacity !== item.capacity) {
          updateData.capacity = item.capacity;
        }
        if (item.roomName && existingRoom.roomName !== item.roomName) {
          updateData.roomName = item.roomName;
        }
        if (Object.keys(updateData).length > 0) {
          roomsToUpdate.push({
            id: existingRoom.id,
            ...updateData
          });
        }
      }
    }
    
    // 第四步：批量创建机房
    if (roomsToCreate.length > 0) {
      await prisma.computerRoom.createMany({
        data: roomsToCreate.map(r => ({
          roomNumber: r.roomNumber,
          roomName: r.roomName,
          capacity: r.capacity,
          location: r.location || '',
          description: ''
        })),
        skipDuplicates: true
      });
    }
    
    // 第五步：批量更新机房
    for (const update of roomsToUpdate) {
      await prisma.computerRoom.update({
        where: { id: update.id },
        data: { roomName: update.roomName, capacity: update.capacity }
      });
    }
    
    // 第六步：重新查询所有机房（包括新创建的）
    const allRooms = await prisma.computerRoom.findMany({
      where: {
        roomNumber: { in: uniqueRoomNumbers }
      }
    });
    const roomIdMap = new Map(allRooms.map(room => [room.roomNumber, room.id]));
    
    // 第七步：批量创建课程记录（分批处理，每批1000条）
    const batchSize = 1000;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const schedulesToCreate = batch
        .map(item => {
          const roomId = roomIdMap.get(item.roomNumber);
          if (!roomId) {
            console.warn(`找不到机房: ${item.roomNumber}`);
            return null;
          }
          return {
            computerRoomId: roomId,
            versionId: versionId, // 关联版本
            courseName: item.courseName,
            teacher: item.teacher,
            classes: item.classes,
            weekStart: item.weekStart,
            weekEnd: item.weekEnd,
            dayOfWeek: item.dayOfWeek,
            periodStart: item.periodStart,
            periodEnd: item.periodEnd,
            source: 'import' as const,
            status: 'active' as const
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      
      if (schedulesToCreate.length > 0) {
        try {
          // 特别记录11-13节的课程
          const eveningCourses = schedulesToCreate.filter(s => s.periodStart >= 11 || s.periodEnd >= 11);
          if (eveningCourses.length > 0) {
            console.log(`[数据库导入] 准备导入 ${eveningCourses.length} 条11-13节课程:`);
            eveningCourses.forEach(course => {
              console.log(`  - 机房=${course.computerRoomId}, 星期=${course.dayOfWeek}, 节次=${course.periodStart}-${course.periodEnd}, 课程="${course.courseName}", 教师="${course.teacher}", 周次=${course.weekStart}-${course.weekEnd}`);
            });
          }
          
          const result = await prisma.schedule.createMany({
            data: schedulesToCreate,
            skipDuplicates: true
          });
          
          console.log(`[数据库导入] 成功创建 ${result.count} 条记录（本批次共 ${schedulesToCreate.length} 条）`);
          
          // 如果创建的数量少于准备创建的数量，说明有重复记录
          if (result.count < schedulesToCreate.length) {
            const skipped = schedulesToCreate.length - result.count;
            console.warn(`[数据库导入] 跳过了 ${skipped} 条重复记录`);
          }
          
          success += result.count;
          failed += (schedulesToCreate.length - result.count);
        } catch (error) {
          console.error(`批量创建课程记录失败:`, error);
          failed += schedulesToCreate.length;
        }
      }
    }
    
    // 更新版本记录数
    if (versionId) {
      await prisma.scheduleVersion.update({
        where: { id: versionId },
        data: { recordCount: success }
      });
    }
    
  } catch (error) {
    console.error('导入数据时发生错误:', error);
    failed = data.length;
    // 如果创建了版本但导入失败，删除版本记录
    if (versionId) {
      try {
        await prisma.scheduleVersion.delete({ where: { id: versionId } });
      } catch (e) {
        console.error('删除版本记录失败:', e);
      }
    }
  }
  
  return { success, failed, versionId };
}

