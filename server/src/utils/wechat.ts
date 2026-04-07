import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 统一的响应接口
interface WeChatResponse {
  success: boolean;
  mediaId?: string;
  message: string;
  error?: any;
}

// 配置接口
interface WeChatConfig {
  webhookUrl: string;
  maxRetries?: number;
  timeout?: number;
  maxFileSizeMB?: number;
}

// 企业微信发送器类
export class WeChatFileSender {
  private axios: any = null;
  private FormData: any = null;
  private config: WeChatConfig;
  private isInitialized = false;
  private initPromise: Promise<void>;

  constructor(config: WeChatConfig) {
    this.config = {
      maxRetries: 3,
      timeout: 30000,
      maxFileSizeMB: 20,
      ...config
    };
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 动态加载依赖
      this.axios = (await import('axios')).default;
      this.FormData = (await import('form-data')).default;
      this.isInitialized = true;
    } catch (error) {
      console.warn('企业微信功能依赖未安装，部分功能受限:', error);
    }
  }

  /** 等待初始化完成，替代固定的 setTimeout */
  async waitReady(): Promise<void> {
    await this.initPromise;
  }

  // 统一的重试装饰器
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`${operationName} 第 ${attempt} 次尝试失败:`, error);
        
        if (attempt < this.config.maxRetries!) {
          // 指数退避
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
          continue;
        }
      }
    }
    
    throw lastError;
  }

  // 提取key从webhook URL
  private extractKeyFromWebhook(webhookUrl: string): string {
    try {
      const url = new URL(webhookUrl);
      const key = url.searchParams.get('key');
      if (!key) {
        throw new Error('Webhook URL中未找到key参数');
      }
      return key;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无效的Webhook URL: ${message}`);
    }
  }

  // 构建上传URL（企业微信webhook只支持file类型）
  private buildUploadUrl(webhookUrl: string): string {
    const key = this.extractKeyFromWebhook(webhookUrl);
    return `https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${encodeURIComponent(key)}&type=file`;
  }

  // 检查文件
  private checkFile(filePath: string): { sizeMB: number; filename: string } {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    if (sizeMB > this.config.maxFileSizeMB!) {
      throw new Error(
        `文件大小超过限制: ${sizeMB.toFixed(2)}MB > ${this.config.maxFileSizeMB}MB`
      );
    }

    return {
      sizeMB,
      filename: path.basename(filePath)
    };
  }

  // 处理文件名：去掉时间戳部分
  private formatFilename(filename: string): string {
    const ext = path.extname(filename);
    const name = filename.slice(0, -ext.length);

    // 常见时间戳格式：-20251225_082543 或 -1766836439941（毫秒）
    const tsMatch = name.match(/(.+)-(\d{8}_\d{6}|\d{13,})$/);
    const cleanBase = tsMatch ? tsMatch[1] : name;

    return cleanBase + ext;
  }

  // 获取文件创建时间
  private getFileCreationTime(filePath: string): string {
    try {
      const stats = fs.statSync(filePath);
      const time = stats.birthtime || stats.mtime;
      // 使用北京时间格式化为 YYYY-MM-DD HH:mm:ss
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(time).reduce<Record<string,string>>((acc, cur) => {
        if (cur.type !== 'literal') acc[cur.type] = cur.value;
        return acc;
      }, {});
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    } catch (error) {
      const nowParts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(new Date()).reduce<Record<string,string>>((acc, cur) => {
        if (cur.type !== 'literal') acc[cur.type] = cur.value;
        return acc;
      }, {});
      return `${nowParts.year}-${nowParts.month}-${nowParts.day} ${nowParts.hour}:${nowParts.minute}:${nowParts.second}`;
    }
  }


  // 上传文件（核心方法）
  async uploadFile(filePath: string): Promise<WeChatResponse> {
    if (!this.isInitialized) {
      return {
        success: false,
        message: '企业微信功能未初始化，请检查依赖是否安装'
      };
    }

    try {
      // 检查文件
      const { sizeMB, filename } = this.checkFile(filePath);
      
      // 获取上传URL（企业微信webhook只支持file类型）
      const uploadUrl = this.buildUploadUrl(this.config.webhookUrl);
      
      // 创建FormData
      const form = new this.FormData();
      const fileStream = fs.createReadStream(filePath);
      
      const uploadFilename = this.formatFilename(filename);
      // 以字符串形式传入 filename，确保 multipart 中使用该文件名
      form.append('media', fileStream, uploadFilename);
      // debug log
      console.debug('[wechat] upload filename:', uploadFilename);

      // 上传文件（带重试）
      const uploadResponse = await this.withRetry(
        async () => {
          return await this.axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            timeout: this.config.timeout,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
          });
        },
        '文件上传'
      );

      // 处理响应
      if (uploadResponse.status === 200) {
        const data = uploadResponse.data;
        if (data.errcode === 0) {
          return {
            success: true,
            mediaId: data.media_id,
            message: '文件上传成功'
          };
        } else {
          return {
            success: false,
            message: `上传失败: ${data.errmsg || '未知错误'}`
          };
        }
      } else {
        return {
          success: false,
          message: `HTTP错误: ${uploadResponse.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `上传异常: ${error.message || error}`,
        error
      };
    }
  }

  // 发送文件消息（企业微信webhook只支持文件类型）
  async sendFileMessage(mediaId: string, customText?: string): Promise<WeChatResponse> {
    if (!this.isInitialized) {
      return {
        success: false,
        message: '企业微信功能未初始化'
      };
    }

    try {
      // 企业微信webhook只支持文件消息
      const message = { msgtype: 'file', file: { media_id: mediaId } };

      const sendResponse = await this.withRetry(
        async () => {
          return await this.axios.post(
            this.config.webhookUrl,
            message,
            { timeout: this.config.timeout }
          );
        },
        '发送文件消息'
      );

      if (sendResponse.status === 200) {
        const data = sendResponse.data;
        if (data.errcode === 0) {
          // 可选发送文本提示
          if (customText) {
            await this.sendTextMessage(customText).catch(() => {
              // 文本提示失败不影响主流程
            });
          }
          
          return {
            success: true,
            message: '文件消息发送成功'
          };
        } else {
          return {
            success: false,
            message: `发送失败: ${data.errmsg || '未知错误'}`
          };
        }
      } else {
        return {
          success: false,
          message: `HTTP错误: ${sendResponse.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `发送异常: ${error.message || error}`,
        error
      };
    }
  }

  // 发送Base64图片消息（尝试直接预览）
  async sendImageMessage(filePath: string): Promise<WeChatResponse> {
    if (!this.isInitialized) {
      return {
        success: false,
        message: '企业微信功能未初始化'
      };
    }

    try {
      // 检查是否为图片文件
      const ext = path.extname(filePath).toLowerCase();
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
      if (!imageExts.includes(ext)) {
        return {
          success: false,
          message: '不支持的图片格式'
        };
      }

      // 读取图片文件并转换为Base64
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      
      // 构造图片消息
      const message = {
        msgtype: 'image',
        image: {
          base64: base64Image,
          md5: crypto.createHash('md5').update(imageBuffer).digest('hex')
        }
      };

      const sendResponse = await this.withRetry(
        async () => {
          return await this.axios.post(
            this.config.webhookUrl,
            message,
            { timeout: this.config.timeout }
          );
        },
        '发送图片消息'
      );

      if (sendResponse.status === 200) {
        const data = sendResponse.data;
        if (data.errcode === 0) {
          return {
            success: true,
            message: '图片消息发送成功'
          };
        } else {
          return {
            success: false,
            message: `发送失败: ${data.errmsg || '未知错误'}`
          };
        }
      } else {
        return {
          success: false,
          message: `HTTP错误: ${sendResponse.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `发送异常: ${error.message || error}`,
        error
      };
    }
  }

  // 发送文本消息
  async sendTextMessage(content: string): Promise<WeChatResponse> {
    if (!this.isInitialized) {
      return {
        success: false,
        message: '企业微信功能未初始化'
      };
    }

    try {
      const message = {
        msgtype: 'text',
        text: { content }
      };

      const response = await this.axios.post(
        this.config.webhookUrl,
        message,
        { timeout: this.config.timeout }
      );

      if (response.status === 200 && response.data.errcode === 0) {
        return {
          success: true,
          message: '文本消息发送成功'
        };
      } else {
        return {
          success: false,
          message: `发送失败: ${response.data?.errmsg || '未知错误'}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `发送异常: ${error.message || error}`,
        error
      };
    }
  }

  // 完整发送流程（支持Excel和图片文件）
  async sendExcelFile(
    filePath: string,
    options?: {
      week?: number;
      customMessage?: string;
      fallbackToLink?: boolean;
      downloadUrl?: string;
      sharedFilePath?: string; // 共享文件路径
    }
  ): Promise<WeChatResponse> {
    const { week, customMessage, fallbackToLink = true, downloadUrl, sharedFilePath } = options || {};
    
    // 获取文件信息
    const originalFilename = path.basename(filePath);
    const cleanFilename = this.formatFilename(originalFilename);
    const fileCreationTime = this.getFileCreationTime(filePath);
    
    // 检查是否为图片文件
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext);
    
    if (isImage) {
      // 对于图片文件，尝试使用Base64方式发送以实现直接预览
      const imageResult = await this.sendImageMessage(filePath);
      
      if (imageResult.success) {
        // 图片发送成功，发送提示消息
        let successContent = `📋 课程表图片已发送完成！\n`;
        successContent += `📁 文件名：${cleanFilename}\n`;
        if (week) successContent += `🗓 周次：第${week}周\n`;
        successContent += `⏰ 生成时间：${fileCreationTime}`;
        
        if (customMessage) {
          successContent += `\n\n💬 备注：${customMessage}`;
        }
        
        const textResult = await this.sendTextMessage(successContent);
        
        return {
          success: true,
          message: '图片发送成功'
        };
      } else {
        // 图片发送失败，降级为文件发送
        console.warn('图片消息发送失败，降级为文件发送:', imageResult.message);
      }
    }
    
    // 对于非图片文件或图片发送失败时，使用文件上传方式
    // 1. 上传文件
    const uploadResult = await this.uploadFile(filePath);
    
    if (!uploadResult.success) {
      // 上传失败，发送文本通知
      let fallbackContent = `📋 课程表文件已生成完成！\n\n`;
      fallbackContent += `📁 文件名：${cleanFilename}\n`;
      if (week) fallbackContent += `🗓 周次：第${week}周\n`;
      fallbackContent += `⏰ 生成时间：${fileCreationTime}\n`;
      fallbackContent += `❌ 上传失败：${uploadResult.message}`;
      
      if (customMessage) {
        fallbackContent += `\n\n💬 备注：${customMessage}`;
      }
      
      const textResult = await this.sendTextMessage(fallbackContent);
      return {
        success: false,
        message: `文件上传失败，已发送通知: ${textResult.message}`
      };
    }

    // 2. 发送文件消息
    const sendResult = await this.sendFileMessage(uploadResult.mediaId!);
    
    if (!sendResult.success) {
      // 消息发送失败，发送文本通知
      let fallbackContent = `📋 课程表文件已生成完成！\n\n`;
      fallbackContent += `📁 文件名：${cleanFilename}\n`;
      if (week) fallbackContent += `🗓 周次：第${week}周\n`;
      fallbackContent += `⏰ 生成时间：${fileCreationTime}\n`;
      fallbackContent += `❌ 文件发送失败：${sendResult.message}`;

      if (customMessage) {
        fallbackContent += `\n\n💬 备注：${customMessage}`;
      }
      
      const textResult = await this.sendTextMessage(fallbackContent);
      return {
        success: false,
        message: `文件消息发送失败，已发送通知: ${textResult.message}`
      };
    }

    // 3. 发送成功提示消息
    let successContent = `📋 课程表文件已发送完成！\n\n`;
    successContent += `📁 文件名：${cleanFilename}\n`;
    if (week) successContent += `🗓 周次：第${week}周\n`;
    successContent += `⏰ 生成时间：${fileCreationTime}`;

    if (customMessage) {
      successContent += `\n\n💬 备注：${customMessage}`;
    }
    
    const textResult = await this.sendTextMessage(successContent);
    
    return textResult.success
      ? {
          success: true,
          message: '文件发送成功',
          mediaId: uploadResult.mediaId
        }
      : {
          success: false,
          message: `文件已发送，但提示消息发送失败: ${textResult.message}`
        };
  }
}
