import express from 'express';
import { queryAvailableRooms, QueryFilter } from '../services/queryService';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * POST /api/query/available-rooms
 * 智能查询空闲机房
 */
router.post('/available-rooms', async (req, res, next) => {
  try {
    const {
      weeks, // 可以是数组 [14,15,16] 或对象 {start: 14, end: 16}
      dayOfWeek, // 1-7
      periodStart,
      periodEnd,
      minCapacity
    } = req.body;
    
    const filter: QueryFilter = {};
    
    if (weeks) {
      filter.weeks = weeks;
    }
    
    if (dayOfWeek) {
      filter.dayOfWeek = parseInt(dayOfWeek);
    }
    
    if (periodStart) {
      filter.periodStart = parseInt(periodStart);
    }
    
    if (periodEnd) {
      filter.periodEnd = parseInt(periodEnd);
    }
    
    if (minCapacity) {
      filter.minCapacity = parseInt(minCapacity);
    }
    
    const availableRooms = await queryAvailableRooms(filter);
    
    res.json({
      success: true,
      data: availableRooms,
      count: availableRooms.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/query/rooms
 * 获取所有机房列表
 */
router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await prisma.computerRoom.findMany({
      orderBy: { roomNumber: 'asc' }
    });
    
    res.json({
      success: true,
      data: rooms
    });
  } catch (error) {
    next(error);
  }
});

export default router;

