import express from 'express';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { uploadAndSendFile } from '../utils/wechat';
import os from 'os';
import {
  PERIOD_RANGES,
  PERIOD_LABELS,
  sortRoomName,
  mergeSchedulesByWeek,
  generateDailyScheduleImage,
} from '../utils/scheduleImage';

// 格式化时间戳为 YYYYMMDD_HHMMSS，用于文件名
function formatTimestampForFilename(date?: Date): string {
  const d = date || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const router = express.Router();

/**
 * 获取最新版本的过滤条件
 */
async function getLatestVersionFilter(): Promise<any> {
  const latestVersion = await prisma.scheduleVersion.findFirst({
    orderBy: { version: 'desc' }
  });

  if (latestVersion) {
    return {
      OR: [
        { versionId: latestVersion.id },
        { versionId: null }
      ]
    };
  } else {
    return { versionId: null };
  }
}

/**
 * duty_schedule 方案二：构建“按机房分 sheet”的高亮课表（ExcelJS）
 * - 保留所有课程
 * - 目标周次命中的课程行整行标红加粗
 */
async function buildHighlightWorkbookByRoom(targetWeek: number) {
  // 获取最新版本过滤条件
  const versionFilter = await getLatestVersionFilter();

  const rooms = await prisma.computerRoom.findMany({
    include: {
      schedules: {
        where: {
          status: 'active',
          ...versionFilter
        },
        orderBy: [
          { weekStart: 'asc' },
          { dayOfWeek: 'asc' },
          { periodStart: 'asc' }
        ]
      }
    },
    orderBy: { roomNumber: 'asc' }
  });

  // 合并相同课程的不同周次记录
  const mergedRooms = mergeSchedulesByWeek(rooms);

  const workbook = new ExcelJS.Workbook();

  const titleFont = { name: '宋体', size: 18 };
  const headerFont = { name: '宋体', size: 12 };
  const periodFont = { name: '宋体', size: 12 };
  const normalFont = { name: '宋体', size: 9, color: { argb: 'FF000000' } };
  const highlightFont = { name: '宋体', size: 9, color: { argb: 'FFFF0000' } };

  // 对rooms按名称排序，以便sheet按顺序创建
  const sortedRooms = [...mergedRooms].sort((a, b) => {
    const nameA = (a.roomName || a.roomNumber || '').toString();
    const nameB = (b.roomName || b.roomNumber || '').toString();
    return sortRoomName(nameA, nameB);
  });

  sortedRooms.forEach((room: any) => {
    if (!room.schedules || room.schedules.length === 0) return;

    const sheetNameRaw = (room.roomName || room.roomNumber).substring(0, 31);
    const sheetName = (sheetNameRaw || '').replace(/[\\\/\?\*\[\]]/g, '_') || `机房${room.roomNumber}`;
    const ws = workbook.addWorksheet(sheetName);

    // 列宽
    ws.getColumn(1).width = 8;
    for (let c = 2; c <= 8; c++) {
      ws.getColumn(c).width = 22;
    }

    // 第一行：标题
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '2025-2026学年第1学期机房上机课表';
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // 第二行：机房信息（不合并，只在第6列显示）
    // 第二行所有单元格初始化为空
    const row2 = ws.addRow(['', '', '', '', '', '', '', '']);
    // 第6列（F列，索引6）显示机房信息
    let roomInfoText = '';
    if (room.roomName) {
      if (room.capacity) {
        roomInfoText = `${room.roomName}(${room.roomNumber}/${room.capacity}人)`;
      } else {
        roomInfoText = `${room.roomName}(${room.roomNumber})`;
      }
    } else {
      if (room.capacity) {
        roomInfoText = `${room.roomNumber}/${room.capacity}人`;
      } else {
        roomInfoText = room.roomNumber;
      }
    }
    const infoCell = row2.getCell(6);
    infoCell.value = roomInfoText;
    infoCell.font = headerFont;
    infoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // 第三行：星期表头（删除了空行）
    const headerRow = ws.addRow(['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']);
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // 4 行起：节次行（因为删除了空行，所以从第4行开始）
    const baseRowIndex = 4;

    // 行索引 -> (星期 -> 课程数组)
    const byRowAndDay: Map<number, Map<number, typeof room.schedules>> = new Map();

    room.schedules.forEach((s: any) => {
      // 可能跨多个节次行（如第7-9节）
      const targetRowIndexes: number[] = [];
      for (const pr of PERIOD_RANGES) {
        const overlap = Math.min(s.periodEnd, pr.end) - Math.max(s.periodStart, pr.start) + 1;
        if (overlap > 0) {
          targetRowIndexes.push(pr.rowIndex);
        }
      }
      if (targetRowIndexes.length === 0) return;

      const day = s.dayOfWeek;
      for (const rowIndex of targetRowIndexes) {
        const rowMap = byRowAndDay.get(rowIndex) || new Map<number, typeof room.schedules>();
        const list = rowMap.get(day) || [];
        list.push(s as any);
        rowMap.set(day, list);
        byRowAndDay.set(rowIndex, rowMap);
      }
    });

    PERIOD_LABELS.forEach((label, idx) => {
      const row = ws.addRow(new Array(8).fill(''));
      const excelRowIndex = baseRowIndex + idx;
      const rowRef = ws.getRow(excelRowIndex);
      rowRef.getCell(1).value = label;
      rowRef.getCell(1).font = periodFont;
      rowRef.getCell(1).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };

      for (let day = 1; day <= 7; day++) {
        const cell = rowRef.getCell(day + 1);
      const schedulesForCell =
          byRowAndDay.get(idx)?.get(day)?.sort((a: any, b: any) => a.periodStart - b.periodStart) || [];

        if (schedulesForCell.length === 0) continue;

        const richText: ExcelJS.CellRichTextValue['richText'] = [];
        schedulesForCell.forEach((s: any, index: number) => {
          // 使用合并后的周次文本（如果存在），否则使用原始周次范围
          const weekStr = (s as any).__combinedWeekText || 
            (s.weekStart === s.weekEnd
              ? `{${s.weekStart}周}`
              : `{${s.weekStart}-${s.weekEnd}周}`);
          const periodText =
            s.periodStart === s.periodEnd
              ? `第${s.periodStart}节`
              : `第${s.periodStart}-${s.periodEnd}节`;
          const lineText = `${s.courseName}◇${periodText}${weekStr}◇${s.teacher}◇${s.classes}`;

          // 检查是否高亮：如果使用合并周次文本，需要检查targetWeek是否在任意一个周次范围内
          let isHighlight = false;
          if ((s as any).__weekRanges) {
            // 如果有合并的周次范围数组，检查targetWeek是否在任意一个范围内
            const weekRanges = (s as any).__weekRanges;
            isHighlight = weekRanges.some((range: { start: number; end: number }) => {
              return targetWeek >= range.start && targetWeek <= range.end;
            });
          } else {
            // 没有合并，使用原始周次范围
            isHighlight = s.weekStart <= targetWeek && targetWeek <= s.weekEnd;
          }

          const font = isHighlight ? highlightFont : normalFont;

          const textWithNewline = (index === 0 ? '' : '\n') + lineText;
          richText.push({ text: textWithNewline, font });
        });

        if (richText.length > 0) {
          cell.value = { richText };
          cell.alignment = { wrapText: true, vertical: 'top' };
        }
      }
    });

    // 设置所有单元格边框和默认字体/对齐
    const thinBorder: ExcelJS.Borders = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
      diagonal: { up: false, down: false, style: 'thin', color: { argb: 'FF000000' } }
    };
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = thinBorder;
        if (!cell.font) {
          cell.font = normalFont;
        }
        if (!cell.alignment) {
          cell.alignment = { wrapText: true, vertical: 'top' };
        }
      });
    });

    // 取消冻结
    ws.views = [];
  });

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet('机房课表');
    ws.addRow(['机房课表']);
    ws.addRow(['暂无数据']);
  }

  return workbook;
}

/**
 * duty_schedule 方案二：构建"按星期分 sheet"的高亮课表（ExcelJS）
 * - 每个 sheet 是某一天
 * - 列：A 为节次，其余为机房
 */
async function buildHighlightWorkbookByWeekday(targetWeek: number) {
  // 获取最新版本过滤条件
  const versionFilter = await getLatestVersionFilter();

  const rooms = await prisma.computerRoom.findMany({
    include: {
      schedules: {
        where: {
          status: 'active',
          ...versionFilter
        },
        orderBy: [
          { weekStart: 'asc' },
          { dayOfWeek: 'asc' },
          { periodStart: 'asc' }
        ]
      }
    },
    orderBy: { roomNumber: 'asc' }
  });

  // 合并相同课程的不同周次记录
  const mergedRooms = mergeSchedulesByWeek(rooms);

  const workbook = new ExcelJS.Workbook();
  const titleFont = { name: '宋体', size: 18 };
  const headerFont = { name: '宋体', size: 12 };
  const periodFont = { name: '宋体', size: 12 };
  const normalFont = { name: '宋体', size: 9, color: { argb: 'FF000000' } };
  const highlightFont = { name: '宋体', size: 9, color: { argb: 'FFFF0000' } };

  // 对rooms按名称排序
  const sortedRooms = [...mergedRooms].sort((a, b) => {
    const nameA = (a.roomName || a.roomNumber || '').toString();
    const nameB = (b.roomName || b.roomNumber || '').toString();
    return sortRoomName(nameA, nameB);
  });

  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  weekdays.forEach((weekdayName, weekdayIndex) => {
    const ws = workbook.addWorksheet(weekdayName);

    // 列宽：A 8，其余每个机房 22
    ws.getColumn(1).width = 8;
    for (let c = 2; c <= sortedRooms.length + 1; c++) {
      ws.getColumn(c).width = 22;
    }

    // 标题行
    const lastCol = sortedRooms.length + 1;
    ws.mergeCells(1, 1, 1, lastCol);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = '2025-2026学年第1学期机房上机课表';
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // 表头行：A 列"节次/时间"，后面是机房名（按排序后的顺序）
    const headerRow = ws.addRow([
      '节次/时间',
      ...sortedRooms.map((room) => room.roomName || room.roomNumber)
    ]);
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    const baseRowIndex = ws.rowCount + 1;

    // 预先构造：roomIndex -> rowIndex -> schedules[]
    // 注意：这里需要使用sortedRooms的索引来映射
    const byRoomAndRow: Array<Map<number, any[]>> = sortedRooms.map(() => new Map());
    
    // 创建一个映射：原始room ID -> sortedRooms中的索引
    const roomIdToSortedIndex = new Map<string | number, number>();
    sortedRooms.forEach((room: any, idx: number) => {
      roomIdToSortedIndex.set(String(room.id), idx);
    });

    // 处理所有mergedRooms的schedules，按照sortedRooms的顺序存储
    mergedRooms.forEach((room: any) => {
      const sortedIdx = roomIdToSortedIndex.get(String(room.id));
      if (sortedIdx === undefined) return; // 如果不在sortedRooms中，跳过
      room.schedules.forEach((s: any) => {
        if (s.dayOfWeek !== weekdayIndex + 1) return;

        const targetRowIndexes: number[] = [];
        for (const pr of PERIOD_RANGES) {
          const overlap = Math.min(s.periodEnd, pr.end) - Math.max(s.periodStart, pr.start) + 1;
          if (overlap > 0) {
            targetRowIndexes.push(pr.rowIndex);
          }
        }
        if (targetRowIndexes.length === 0) return;

        const map = byRoomAndRow[sortedIdx];
        for (const rowIndex of targetRowIndexes) {
          const list = map.get(rowIndex) || [];
          list.push(s as any);
          map.set(rowIndex, list);
        }
      });
    });

    PERIOD_LABELS.forEach((label, prIndex) => {
      const row = ws.addRow(new Array(sortedRooms.length + 1).fill(''));
      const excelRowIndex = baseRowIndex + prIndex;
      const rowRef = ws.getRow(excelRowIndex);
      rowRef.getCell(1).value = label;
      rowRef.getCell(1).font = periodFont;
      rowRef.getCell(1).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };

      sortedRooms.forEach((_, roomIdx) => {
        const cell = rowRef.getCell(roomIdx + 2);
        const schedulesForCell =
          byRoomAndRow[roomIdx].get(prIndex)?.sort((a, b) => a.periodStart - b.periodStart) || [];
        if (schedulesForCell.length === 0) return;

        const richText: ExcelJS.CellRichTextValue['richText'] = [];
        schedulesForCell.forEach((s, index) => {
          // 使用合并后的周次文本（如果存在），否则使用原始周次范围
          const weekStr = (s as any).__combinedWeekText || 
            (s.weekStart === s.weekEnd
              ? `{${s.weekStart}周}`
              : `{${s.weekStart}-${s.weekEnd}周}`);
          const periodText =
            s.periodStart === s.periodEnd
              ? `第${s.periodStart}节`
              : `第${s.periodStart}-${s.periodEnd}节`;
          const lineText = `${s.courseName}◇${periodText}${weekStr}◇${s.teacher}◇${s.classes}`;

          // 检查是否高亮：如果使用合并周次文本，需要检查targetWeek是否在任意一个周次范围内
          let isHighlight = false;
          if ((s as any).__weekRanges) {
            // 如果有合并的周次范围数组，检查targetWeek是否在任意一个范围内
            const weekRanges = (s as any).__weekRanges;
            isHighlight = weekRanges.some((range: { start: number; end: number }) => {
              return targetWeek >= range.start && targetWeek <= range.end;
            });
          } else {
            // 没有合并，使用原始周次范围
            isHighlight = s.weekStart <= targetWeek && targetWeek <= s.weekEnd;
          }

          const font = isHighlight ? highlightFont : normalFont;
          const textWithNewline = (index === 0 ? '' : '\n') + lineText;

          richText.push({ text: textWithNewline, font });
        });

        if (richText.length > 0) {
          cell.value = { richText };
          cell.alignment = { wrapText: true, vertical: 'top' };
        }
      });
    });

    // 设置所有单元格边框和默认字体/对齐
    const thinBorder: ExcelJS.Borders = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
      diagonal: { up: false, down: false, style: 'thin', color: { argb: 'FF000000' } }
    };
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = thinBorder;
        if (!cell.font) {
          cell.font = normalFont;
        }
        if (!cell.alignment) {
          cell.alignment = { wrapText: true, vertical: 'top' };
        }
      });
    });

    // 取消冻结
    ws.views = [];
  });

  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet('机房课表');
    ws.addRow(['机房课表']);
    ws.addRow(['暂无数据']);
  }

  return workbook;
}

/**
 * 合并相同课程的不同周次记录（用于 /excel 接口内联合并，其余接口使用 scheduleImage 导出的版本）
 */
function mergeForExcel(rooms: any[]): any[] {
  return rooms.map((room) => {
    if (!room.schedules || room.schedules.length === 0) {
      return room;
    }

    const groups = new Map<
      string,
      { base: any; weekRanges: Array<{ start: number; end: number }> }
    >();

    for (const s of room.schedules) {
      const key = [
        s.courseName,
        s.teacher,
        s.classes,
        s.dayOfWeek,
        s.periodStart,
        s.periodEnd,
        s.computerRoomId
      ].join('|');

      const range = { start: s.weekStart, end: s.weekEnd };

      if (!groups.has(key)) {
        groups.set(key, { base: s, weekRanges: [range] });
      } else {
        groups.get(key)!.weekRanges.push(range);
      }
    }

    const mergedSchedules = Array.from(groups.values()).map((g) => {
      const ranges = g.weekRanges
        .map((r) => ({ ...r }))
        .sort((a, b) => a.start - b.start || a.end - b.end);

      // 计算用于导出的周次文本，如 {1-4周,7-10周}
      const weekTextParts = ranges.map((r) =>
        r.start === r.end ? `${r.start}周` : `${r.start}-${r.end}周`
      );
      const combinedWeekText = `{${weekTextParts.join(',')}}`;

      // 为了不影响逻辑，只在导出时额外挂一个属性供导出函数使用
      return {
        ...g.base,
        __combinedWeekText: combinedWeekText,
        __weekRanges: ranges // 保留所有周次范围，用于高亮判断
      };
    });

    return {
      ...room,
      schedules: mergedSchedules
    };
  });
}

async function buildRoomWorkbook(
  rooms: any[],
  options?: {
    targetWeek?: number;
  }
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  // 定义字体样式
  const titleFont = { name: '宋体', size: 18 };
  const headerFont = { name: '宋体', size: 12 };
  const periodFont = { name: '宋体', size: 12 };
  const cellFont = { name: '宋体', size: 9 };

  // 边框样式
  const thinBorder: ExcelJS.Borders = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
    diagonal: { up: false, down: false, style: 'thin', color: { argb: 'FF000000' } }
  };

  // 对rooms按名称排序，以便sheet按顺序创建
  const sortedRooms = [...rooms].sort((a, b) => {
    const nameA = (a.roomName || a.roomNumber || '').toString();
    const nameB = (b.roomName || b.roomNumber || '').toString();
    return sortRoomName(nameA, nameB);
  });

  for (const room of sortedRooms) {
    if (!room.schedules || room.schedules.length === 0) continue;

    // 行索引 -> (星期 -> 文本)
    const scheduleMap: Map<number, Map<number, string>> = new Map();

    room.schedules.forEach((schedule: any) => {
      // 如果指定了周次，则只保留覆盖该周的课程
      if (options?.targetWeek != null) {
        const w = options.targetWeek;
        if (typeof w === 'number') {
          // 如果有合并的周次范围，检查目标周次是否在任意一个范围内
          if ((schedule as any).__weekRanges) {
            const weekRanges = (schedule as any).__weekRanges;
            const isInRange = weekRanges.some((range: { start: number; end: number }) => {
              return w >= range.start && w <= range.end;
            });
            if (!isInRange) {
              return;
            }
          } else {
            // 没有合并，使用原始周次范围
            if (!(schedule.weekStart <= w && w <= schedule.weekEnd)) {
              return;
            }
          }
        }
      }

      // 找到课程应该落入的所有行（可能跨多行：如第7-9节要落在6-7和8-9两行）
      const targetRowIndexes: number[] = [];

      for (const range of PERIOD_RANGES) {
        const overlap =
          Math.min(schedule.periodEnd, range.end) - Math.max(schedule.periodStart, range.start) + 1;

        if (overlap > 0) {
          targetRowIndexes.push(range.rowIndex);
        }
      }

      if (targetRowIndexes.length === 0) {
        console.warn(
          `无法匹配节次：第${schedule.periodStart}-${schedule.periodEnd}节，课程：${schedule.courseName}`
        );
        return;
      }

      // 使用合并后的周次文本（如果存在），否则使用原始周次范围
      let weekStr: string;
      if ((schedule as any).__combinedWeekText) {
        weekStr = (schedule as any).__combinedWeekText;
      } else {
        weekStr = schedule.weekStart === schedule.weekEnd
          ? `{${schedule.weekStart}周}`
          : `{${schedule.weekStart}-${schedule.weekEnd}周}`;
      }

      const periodText =
        schedule.periodStart === schedule.periodEnd
          ? `第${schedule.periodStart}节`
          : `第${schedule.periodStart}-${schedule.periodEnd}节`;

      const courseText = `${schedule.courseName}◇${periodText}${weekStr}◇${schedule.teacher}◇${schedule.classes}`;

      // 同一门课可能填充到多个节次行（如第7-9节分布在6-7和8-9两行）
      for (const rowIndex of targetRowIndexes) {
        const dayMap = scheduleMap.get(rowIndex) || new Map<number, string>();
        const existing = dayMap.get(schedule.dayOfWeek) || '';
        dayMap.set(schedule.dayOfWeek, existing ? `${existing}\n${courseText}` : courseText);
        scheduleMap.set(rowIndex, dayMap);
      }
    });

    // 如果指定了 targetWeek 且该机房在该周没有课程，则跳过该 sheet
    if (options?.targetWeek != null) {
      const hasAny = Array.from(scheduleMap.values()).some((dayMap) =>
        Array.from(dayMap.values()).some((val) => val && val.trim() !== '')
      );
      if (!hasAny) {
        continue;
      }
    }

    let sheetName = (room.roomName || room.roomNumber).substring(0, 31);
    sheetName = sheetName.replace(/[\\\/\?\*\[\]]/g, '_');
    if (!sheetName || sheetName.trim() === '') {
      sheetName = `机房${room.roomNumber}`;
    }

    const ws = workbook.addWorksheet(sheetName);

    // 设置列宽
    ws.getColumn(1).width = 10;
    for (let c = 2; c <= 8; c++) {
      ws.getColumn(c).width = 22;
    }

    // 第一行：标题（合并A1-H1）
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '2025-2026学年第1学期机房上机课表';
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // 第二行：机房信息（不合并，只在第6列显示）
    // 第二行所有单元格初始化为空
    const row2 = ws.addRow(['', '', '', '', '', '', '', '']);
    // 第6列（F列，索引6）显示机房信息
    let roomInfoText = '';
    if (room.roomName) {
      if (room.capacity) {
        roomInfoText = `${room.roomName}(${room.roomNumber}/${room.capacity}人)`;
      } else {
        roomInfoText = `${room.roomName}(${room.roomNumber})`;
      }
    } else {
      if (room.capacity) {
        roomInfoText = `${room.roomNumber}/${room.capacity}人`;
      } else {
        roomInfoText = room.roomNumber;
      }
    }
    const infoCell = row2.getCell(6);
    infoCell.value = roomInfoText;
    infoCell.font = headerFont;
    infoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // 第三行：星期标题行
    const headerRow = ws.addRow(['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']);
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    // 节次行
    PERIOD_LABELS.forEach((label, idx) => {
      const row = ws.addRow(['', '', '', '', '', '', '', '']);
      const rowRef = ws.getRow(row.number);
      
      // 第一列：节次标签
      const periodCell = rowRef.getCell(1);
      periodCell.value = label;
      periodCell.font = periodFont;
      periodCell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };

      // 其他列：课程内容
      for (let day = 1; day <= 7; day++) {
        const cell = rowRef.getCell(day + 1);
        const dayMap = scheduleMap.get(idx) || new Map<number, string>();
        const cellContent = dayMap.get(day) || '';
        cell.value = cellContent;
        cell.font = cellFont;
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      }
    });

    // 设置所有单元格边框
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = thinBorder;
      });
    });

    // 取消冻结
    ws.views = [];
  }

  // 如果没有数据，创建一个空表
  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet('机房课表');
    ws.addRow(['机房课表']);
    ws.addRow(['暂无数据']);
  }

  return workbook;
}

/**
 * GET /api/export/excel
 * 导出完整课表为Excel文件（需要管理员权限）
 */
router.get('/excel', authenticate, requireAdmin, async (req, res, next) => {
  try {
    // 获取最新版本过滤条件
    const versionFilter = await getLatestVersionFilter();

    const rooms = await prisma.computerRoom.findMany({
      include: {
        schedules: {
          where: {
            status: 'active',
            ...versionFilter
          },
          orderBy: [
            { weekStart: 'asc' },
            { dayOfWeek: 'asc' },
            { periodStart: 'asc' }
          ]
        }
      },
      orderBy: { roomNumber: 'asc' }
    });

    // 在导出前，对同一课程在不同周次的记录进行合并，仅影响导出展示，不改动数据库
    const mergedRooms = mergeForExcel(rooms);

    const workbook = await buildRoomWorkbook(mergedRooms);

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `机房课表_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    res.send(buffer);
  } catch (error: any) {
    console.error('导出Excel时出错:', error);
    console.error('错误堆栈:', error.stack);
    next(error);
  }
});

/**
 * GET /api/export/original
 * 导出最近一次导入的原始文件（需管理员权限）
 */
router.get('/original', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const latestVersion = await prisma.scheduleVersion.findFirst({
      orderBy: { version: 'desc' }
    });

    if (!latestVersion) {
      return res.status(404).json({ error: '未找到任何导入记录' });
    }

    const filePath = latestVersion.originalFilePath;
    if (!filePath) {
      return res.status(404).json({ error: '该版本未保存原始文件' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '原始文件已丢失：' + filePath });
    }

    const filename = latestVersion.fileName || path.basename(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (err) => {
      next(err);
    });
    // 如果请求中包含 sendToWechat=true，则在后台上传并发送到企业微信群
    if (req.query.sendToWechat === 'true') {
      (async () => {
        try {
          const resSend = await uploadAndSendFile(filePath);
          console.log('[wechat] uploadAndSendFile result:', resSend);
        } catch (e) {
          console.error('[wechat] uploadAndSendFile error:', e);
        }
      })();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/export/excel-by-week
 * 按指定周次导出课表（普通用户可用）
 * query: week=1-30
 * 注意：对普通用户开放，不需要登录 token
 */
router.get('/excel-by-week', async (req, res, next) => {
  try {
    const weekParam = req.query.week as string | undefined;
    const week = weekParam ? parseInt(weekParam, 10) : NaN;

    if (!weekParam || Number.isNaN(week) || week < 1 || week > 30) {
      return res.status(400).json({ error: '无效的周次参数，必须是 1-30 的整数' });
    }

    // 获取最新版本过滤条件
    const versionFilter = await getLatestVersionFilter();

    const rooms = await prisma.computerRoom.findMany({
      include: {
        schedules: {
          where: {
            status: 'active',
            ...versionFilter
          },
          orderBy: [
            { weekStart: 'asc' },
            { dayOfWeek: 'asc' },
            { periodStart: 'asc' }
          ]
        }
      },
      orderBy: { roomNumber: 'asc' }
    });

    // 合并相同课程的不同周次记录
    const mergedRooms = mergeSchedulesByWeek(rooms);

    const workbook = await buildRoomWorkbook(mergedRooms, { targetWeek: week });

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `机房课表_第${week}周_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    res.send(buffer);

    // 如果请求中包含 sendToWechat=true，则在后台上传并发送到企业微信群
    if (req.query.sendToWechat === 'true') {
      try {
        const tempDir = path.join('uploads', 'shared');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const ts = formatTimestampForFilename();
        const tempPath = path.join(tempDir, `机房课表_第${week}周_${ts}.xlsx`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        // 异步上传发送，不阻塞响应
        (async () => {
          try {
            const resSend = await uploadAndSendFile(tempPath, { week, sharedFilePath: path.resolve(tempPath) });
            console.log('[wechat] uploadAndSendFile result:', resSend);
          } catch (e) {
            console.error('[wechat] uploadAndSendFile error:', e);
          }
        })();
      } catch (e) {
        console.error('后台上传到企业微信失败:', e);
      }
    }
  } catch (error: any) {
    console.error('按周次导出Excel时出错:', error);
    console.error('错误堆栈:', error.stack);
    next(error);
  }
});

/**
 * GET /api/export/highlight-by-week/room
 * duty_schedule 方案二：按机房视角，高亮指定周次的课程
 * 对普通用户开放，不需要登录 token
 */
router.get('/highlight-by-week/room', async (req, res, next) => {
  try {
    const weekParam = req.query.week as string | undefined;
    const week = weekParam ? parseInt(weekParam, 10) : NaN;

    if (!weekParam || Number.isNaN(week) || week < 1 || week > 30) {
      return res.status(400).json({ error: '无效的周次参数，必须是 1-30 的整数' });
    }

    const workbook = await buildHighlightWorkbookByRoom(week);
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `课表-第${week}周-按机房.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));

    if (req.query.sendToWechat === 'true') {
      try {
        const tempDir = path.join('uploads', 'shared');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const ts = formatTimestampForFilename();
        const tempPath = path.join(tempDir, `课表-第${week}周-按机房-${ts}.xlsx`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        (async () => {
          try {
            const resSend = await uploadAndSendFile(tempPath, { week, sharedFilePath: path.resolve(tempPath) });
            console.log('[wechat] uploadAndSendFile result:', resSend);
          } catch (e) {
            console.error('[wechat] uploadAndSendFile error:', e);
          }
        })();
      } catch (e) {
        console.error('后台上传到企业微信失败:', e);
      }
    }
  } catch (error: any) {
    console.error('按机房高亮导出时出错:', error);
    console.error('错误堆栈:', error.stack);
    next(error);
  }
});

/**
 * GET /api/export/highlight-by-week/weekday
 * duty_schedule 方案二：按星期视角，高亮指定周次的课程
 * 对普通用户开放，不需要登录 token
 */
router.get('/highlight-by-week/weekday', async (req, res, next) => {
  try {
    const weekParam = req.query.week as string | undefined;
    const week = weekParam ? parseInt(weekParam, 10) : NaN;

    if (!weekParam || Number.isNaN(week) || week < 1 || week > 30) {
      return res.status(400).json({ error: '无效的周次参数，必须是 1-30 的整数' });
    }

    const workbook = await buildHighlightWorkbookByWeekday(week);
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `课表-第${week}周-按星期.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));

    if (req.query.sendToWechat === 'true') {
      try {
        const tempDir = path.join('uploads', 'shared');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const ts = formatTimestampForFilename();
        const tempPath = path.join(tempDir, `课表-第${week}周-按星期-${ts}.xlsx`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        (async () => {
          try {
            const resSend = await uploadAndSendFile(tempPath, { week, sharedFilePath: path.resolve(tempPath) });
            console.log('[wechat] uploadAndSendFile result:', resSend);
          } catch (e) {
            console.error('[wechat] uploadAndSendFile error:', e);
          }
        })();
      } catch (e) {
        console.error('后台上传到企业微信失败:', e);
      }
    }
  } catch (error: any) {
    console.error('按星期高亮导出时出错:', error);
    console.error('错误堆栈:', error.stack);
    next(error);
  }
});

/**
 * GET /api/export/daily-schedule
 * 生成指定周次和星期几的单日课表图片并发送到企业微信
 * query: week=1-30, dayOfWeek=1-7, sendToWechat=true/false
 */
router.get('/daily-schedule', async (req, res, next) => {
  try {
    const weekParam = req.query.week as string | undefined;
    const dayOfWeekParam = req.query.dayOfWeek as string | undefined;
    const sendToWechat = req.query.sendToWechat === 'true';
    
    const week = weekParam ? parseInt(weekParam, 10) : NaN;
    const dayOfWeek = dayOfWeekParam ? parseInt(dayOfWeekParam, 10) : NaN;

    if (!weekParam || Number.isNaN(week) || week < 1 || week > 30) {
      return res.status(400).json({ error: '无效的周次参数，必须是 1-30 的整数' });
    }

    if (!dayOfWeekParam || Number.isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return res.status(400).json({ error: '无效的星期参数，必须是 1-7 的整数' });
    }

    // 获取最新版本过滤条件
    const versionFilter = await getLatestVersionFilter();

    // 获取所有机房
    const allRooms = await prisma.computerRoom.findMany({
      orderBy: { roomNumber: 'asc' }
    });

    // 获取该星期几的所有课程（不限周次，高亮逻辑在绘图时处理）
    const schedules = await prisma.schedule.findMany({
      where: {
        status: 'active',
        dayOfWeek: dayOfWeek,
        ...versionFilter
      },
      include: {
        computerRoom: true
      },
      orderBy: [
        { periodStart: 'asc' }
      ]
    });

    // 将课表数据按机房分组
    const roomScheduleMap = new Map<string, any[]>();
    schedules.forEach(schedule => {
      const roomId = schedule.computerRoomId;
      if (!roomScheduleMap.has(roomId)) {
        roomScheduleMap.set(roomId, []);
      }
      roomScheduleMap.get(roomId)!.push(schedule);
    });

    // 为所有机房添加课表数据（包括空课表的机房）
    const roomsWithSchedules = allRooms.map(room => ({
      ...room,
      schedules: roomScheduleMap.get(room.id) || []
    }));

    // 生成单日课表图片（显示所有机房，包括没有课程的）
    const imageBuffer = await generateDailyScheduleImage(roomsWithSchedules, week, dayOfWeek);

    const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const filename = `第${week}周${dayNames[dayOfWeek]}课表.png`;
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(imageBuffer);

    // 如果需要发送到企业微信
    if (sendToWechat) {
      try {
        const tempDir = path.join('uploads', 'shared');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const ts = formatTimestampForFilename();
        const tempPath = path.join(tempDir, `第${week}周${dayNames[dayOfWeek]}课表_${ts}.png`);
        fs.writeFileSync(tempPath, imageBuffer);
        
        // 异步发送到企业微信
        (async () => {
          try {
            const resSend = await uploadAndSendFile(tempPath, {
              week,
              sharedFilePath: path.resolve(tempPath)
            });
            console.log('[wechat] uploadAndSendFile result:', resSend);
          } catch (e) {
            console.error('[wechat] uploadAndSendFile error:', e);
          }
        })();
      } catch (e) {
        console.error('后台上传到企业微信失败:', e);
      }
    }
  } catch (error: any) {
    console.error('生成单日课表时出错:', error);
    console.error('错误堆栈:', error.stack);
    next(error);
  }
});

export default router;

