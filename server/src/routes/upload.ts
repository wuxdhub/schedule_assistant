import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parseExcelFile, importSchedulesToDatabase, calculateFileHash, checkFileImported } from '../utils/excelParser';

const router = express.Router();

/**
 * 修复文件名编码问题
 * multer 在处理中文文件名时可能会错误解码，需要修复
 * 也用于修复从数据库读取的已存储的乱码文件名
 */
function fixFileNameEncoding(originalname: string): string {
  if (!originalname) return originalname;
  
  try {
    // 检测是否是乱码：包含常见的乱码字符模式
    // æ, å, ä, ö, ü 等是 UTF-8 字节被当作 ISO-8859-1 读取的结果
    const hasGarbledChars = /[æåäöü]/i.test(originalname) || 
                            originalname.includes('') || 
                            /[\u0080-\u00FF]/.test(originalname);
    
    if (hasGarbledChars) {
      // 尝试将 latin1 字节重新解释为 utf8
      // 这是最常见的编码错误：UTF-8 字节被当作 ISO-8859-1 读取
      const fixed = Buffer.from(originalname, 'latin1').toString('utf8');
      
      // 验证修复后的字符串是否包含有效的中文字符
      // 如果修复后包含中文字符，说明修复成功
      if (/[\u4e00-\u9fa5]/.test(fixed)) {
        return fixed;
      }
    }
    
    // 如果文件名看起来正常，直接返回
    return originalname;
  } catch (error) {
    // 如果修复失败，返回原始文件名
    return originalname;
  }
}

// 配置multer用于文件上传
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件格式 (.xlsx, .xls)'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  // 添加文件名处理中间件
  preservePath: false
});

/**
 * POST /api/upload/check
 * 检查文件是否已导入过（用于前端确认）
 */
router.post('/check', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }
    
    const filePath = req.file.path;
    const fileHash = calculateFileHash(filePath);
    
    // 清理临时文件
    fs.unlinkSync(filePath);
    
    // 检查是否已导入
    const checkResult = await checkFileImported(fileHash);
    
    res.json({
      imported: checkResult.imported,
      version: checkResult.version ? {
        id: checkResult.version.id,
        version: checkResult.version.version,
        fileName: fixFileNameEncoding(checkResult.version.fileName), // 修复从数据库读取的文件名编码
        createdAt: checkResult.version.createdAt,
        recordCount: checkResult.version.recordCount
      } : null
    });
  } catch (error: any) {
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    next(error);
  }
});

/**
 * POST /api/upload/excel
 * 上传并导入Excel课表文件
 */
router.post('/excel', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }
    
    const tempPath = req.file.path;
    // 修复文件名编码问题
    let fileName = fixFileNameEncoding(req.file.originalname);

    // 将临时文件移动到 uploads/originals 保存原始文件
    const originalsDir = path.join('uploads', 'originals');
    if (!fs.existsSync(originalsDir)) {
      fs.mkdirSync(originalsDir, { recursive: true });
    }
    const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '_') + '_' + Date.now();
    const destPath = path.join(originalsDir, safeName);
    fs.renameSync(tempPath, destPath);

    // 解析Excel文件（使用已保存的原始文件）
    const data = await parseExcelFile(destPath);
    
    // if (data.length === 0) {
    //   // 清理已保存的原始文件（如果存在）
    //   if (fs.existsSync(destPath)) {
    //     try { fs.unlinkSync(destPath); } catch (_) {}
    //   }
    //   return res.status(400).json({ error: 'Excel文件中没有找到有效数据' });
    // }
    
    // 导入数据库（传入原始文件路径和文件名用于版本管理）
    const result = await importSchedulesToDatabase(data, destPath, fileName);
    // 注意：此处不删除已保存的原始文件（保留以便后续导出）
    
    res.json({
      success: true,
      message: `成功导入 ${result.success} 条记录，失败 ${result.failed} 条`,
      imported: result.success,
      failed: result.failed,
      total: data.length,
      versionId: result.versionId
    });
  } catch (error: any) {
    // 如果发生错误且临时文件依然存在（通常已被重命名移动），尝试删除
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    
    next(error);
  }
});

export default router;


