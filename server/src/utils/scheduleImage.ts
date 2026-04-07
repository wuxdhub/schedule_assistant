import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import sharp from 'sharp';
import os from 'os';

// 注册中文字体，兼容 Windows 和 Linux
(function registerChineseFont() {
  const platform = os.platform();
  const candidates =
    platform === 'win32'
      ? [
          'C:\\Windows\\Fonts\\msyh.ttc',
          'C:\\Windows\\Fonts\\simsun.ttc',
        ]
      : [
          '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
        ];
  for (const p of candidates) {
    try {
      GlobalFonts.registerFromPath(p, 'CJK');
      break;
    } catch {}
  }
})();

export const PERIOD_RANGES: Array<{ start: number; end: number; rowIndex: number }> = [
  { start: 1,  end: 2,  rowIndex: 0 },
  { start: 3,  end: 4,  rowIndex: 1 },
  { start: 5,  end: 5,  rowIndex: 2 },
  { start: 6,  end: 7,  rowIndex: 3 },
  { start: 8,  end: 9,  rowIndex: 4 },
  { start: 10, end: 10, rowIndex: 5 },
  { start: 11, end: 12, rowIndex: 6 },
];

export const PERIOD_LABELS = ['1-2节', '3-4节', '5节', '6-7节', '8-9节', '10节', '晚'];

export function sortRoomName(a: string, b: string): number {
  const getNum = (name: string): number => {
    const match = name.match(/第([一二三四五六七八九十\d]+)/);
    if (!match) return 999;
    const numStr = match[1];
    const numMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '十一': 11, '十二': 12,
    };
    if (numMap[numStr]) return numMap[numStr];
    const num = parseInt(numStr);
    return isNaN(num) ? 999 : num;
  };
  return getNum(a) - getNum(b);
}

export function mergeSchedulesByWeek(rooms: any[]): any[] {
  return rooms.map((room) => {
    if (!room.schedules || room.schedules.length === 0) return room;

    const groups = new Map<string, { base: any; weekRanges: Array<{ start: number; end: number }> }>();

    for (const s of room.schedules) {
      const key = [s.courseName, s.teacher, s.classes, s.dayOfWeek, s.periodStart, s.periodEnd, s.computerRoomId].join('|');
      const range = { start: s.weekStart, end: s.weekEnd };
      if (!groups.has(key)) {
        groups.set(key, { base: s, weekRanges: [range] });
      } else {
        groups.get(key)!.weekRanges.push(range);
      }
    }

    const mergedSchedules = Array.from(groups.values()).map((g) => {
      const ranges = g.weekRanges.map((r) => ({ ...r })).sort((a, b) => a.start - b.start || a.end - b.end);
      const weekTextParts = ranges.map((r) => (r.start === r.end ? `${r.start}周` : `${r.start}-${r.end}周`));
      return {
        ...g.base,
        __combinedWeekText: `{${weekTextParts.join(',')}}`,
        __weekRanges: ranges,
      };
    });

    return { ...room, schedules: mergedSchedules };
  });
}

/**
 * 生成单日课表图片，返回 PNG Buffer
 * @param rooms  每个房间需含 schedules（已按 dayOfWeek 过滤）
 * @param week   目标周次（用于高亮）
 * @param dayOfWeek 星期几 1-7
 */
export async function generateDailyScheduleImage(
  rooms: any[],
  week: number,
  dayOfWeek: number
): Promise<Buffer> {
  const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  const sortedRooms = [...rooms].sort((a, b) => {
    const nameA = (a.roomName || a.roomNumber || '').toString();
    const nameB = (b.roomName || b.roomNumber || '').toString();
    return sortRoomName(nameA, nameB);
  });

  const scheduleMatrix: Array<Map<number, any[]>> = sortedRooms.map(() => new Map());
  sortedRooms.forEach((room, roomIndex) => {
    room.schedules.forEach((schedule: any) => {
      for (const range of PERIOD_RANGES) {
        const overlap = Math.min(schedule.periodEnd, range.end) - Math.max(schedule.periodStart, range.start) + 1;
        if (overlap > 0) {
          const list = scheduleMatrix[roomIndex].get(range.rowIndex) || [];
          list.push(schedule);
          scheduleMatrix[roomIndex].set(range.rowIndex, list);
        }
      }
    });
  });

  const cellWidth = 200;
  const lineHeight = 18;
  const cellPaddingV = 10;
  const cellPaddingH = 5;
  const minCellHeight = 50;
  const maxTextWidth = cellWidth - cellPaddingH * 2;

  const tempCanvas = createCanvas(100, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '12px CJK';

  function wrapText(ctx: any, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
    let currentWidth = 0;
    for (const char of text) {
      const charWidth = ctx.measureText(char).width;
      if (currentWidth + charWidth > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
        currentWidth = charWidth;
      } else {
        current += char;
        currentWidth += charWidth;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const linesCache = new Map<any, string[]>();
  function getScheduleLines(schedule: any): string[] {
    if (linesCache.has(schedule)) return linesCache.get(schedule)!;
    const periodText =
      schedule.periodStart === schedule.periodEnd
        ? `第${schedule.periodStart}节`
        : `第${schedule.periodStart}-${schedule.periodEnd}节`;
    const weekText =
      schedule.weekStart === schedule.weekEnd
        ? `{${schedule.weekStart}周}`
        : `{${schedule.weekStart}-${schedule.weekEnd}周}`;
    const result = wrapText(tempCtx, `${schedule.courseName}◇${periodText}${weekText}◇${schedule.teacher}◇${schedule.classes}`, maxTextWidth);
    linesCache.set(schedule, result);
    return result;
  }

  const rowHeights: number[] = PERIOD_LABELS.map((_, periodIndex) => {
    let maxLines = 0;
    scheduleMatrix.forEach((roomMap) => {
      const schedules = roomMap.get(periodIndex) || [];
      const lines = schedules.reduce((sum: number, s: any, i: number) => {
        return sum + getScheduleLines(s).length + (i < schedules.length - 1 ? 1 : 0);
      }, 0);
      if (lines > maxLines) maxLines = lines;
    });
    return maxLines === 0 ? minCellHeight : Math.max(minCellHeight, cellPaddingV * 2 + maxLines * lineHeight);
  });

  const headerHeight = 60;
  const titleHeight = 50;
  const padding = 20;
  const canvasWidth = Math.max(1200, (sortedRooms.length + 1) * cellWidth + padding * 2);
  const canvasHeight = titleHeight + headerHeight + rowHeights.reduce((a, b) => a + b, 0) + padding * 2;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px CJK';
  ctx.fillText(`第${week}周${dayNames[dayOfWeek]}机房课表`, canvasWidth / 2, padding + titleHeight / 2);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  const startY = padding + titleHeight;

  ctx.font = 'bold 16px CJK';
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(padding, startY, cellWidth, headerHeight);
  ctx.strokeRect(padding, startY, cellWidth, headerHeight);
  ctx.fillStyle = '#000000';
  ctx.fillText('节次/时间', padding + cellWidth / 2, startY + headerHeight / 2);

  sortedRooms.forEach((room, index) => {
    const x = padding + (index + 1) * cellWidth;
    const hasThisWeek = room?.schedules?.some((s: any) => s.weekStart <= week && week <= s.weekEnd);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, startY, cellWidth, headerHeight);
    ctx.strokeRect(x, startY, cellWidth, headerHeight);
    ctx.fillStyle = hasThisWeek ? '#ff0000' : '#000000';
    ctx.fillText(room.roomName || room.roomNumber, x + cellWidth / 2, startY + headerHeight / 2);
  });

  let currentY = startY + headerHeight;
  PERIOD_LABELS.forEach((label, periodIndex) => {
    const rowHeight = rowHeights[periodIndex];
    const y = currentY;

    ctx.font = '14px CJK';
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(padding, y, cellWidth, rowHeight);
    ctx.strokeRect(padding, y, cellWidth, rowHeight);
    ctx.fillStyle = '#000000';
    ctx.fillText(label, padding + cellWidth / 2, y + rowHeight / 2);

    sortedRooms.forEach((_, roomIndex) => {
      const x = padding + (roomIndex + 1) * cellWidth;
      const schedules = scheduleMatrix[roomIndex].get(periodIndex) || [];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, cellWidth, rowHeight);
      ctx.strokeRect(x, y, cellWidth, rowHeight);

      if (schedules.length > 0) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '12px CJK';
        let textY = y + cellPaddingV;
        schedules.forEach((schedule, idx) => {
          const isHighlight = schedule.weekStart <= week && week <= schedule.weekEnd;
          ctx.fillStyle = isHighlight ? '#ff0000' : '#000000';
          const lines = getScheduleLines(schedule);
          lines.forEach((line) => {
            ctx.fillText(line, x + cellPaddingH, textY);
            textY += lineHeight;
          });
          if (idx < schedules.length - 1) textY += lineHeight;
        });
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
      }
    });

    currentY += rowHeight;
  });

  const buffer = canvas.toBuffer('image/png');
  return await sharp(buffer).png({ quality: 90, compressionLevel: 6 }).toBuffer();
}
