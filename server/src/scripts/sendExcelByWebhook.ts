/**
 * 通过企业微信 Webhook URL 发送 Excel 课表文件
 *
 * 此脚本从原 WeeklyExportPage 的"发送文件到企业微信群"功能抽取而来，
 * 对应后端 export.ts 中 highlight-by-week/room 和 highlight-by-week/weekday
 * 接口的 sendToWechat=true 参数逻辑。
 *
 * 使用方式（示例）：
 *   ts-node sendExcelByWebhook.ts --week 10 --type room --webhook https://qyapi.weixin.qq.com/...
 *
 * 核心流程：
 *   1. 调用 buildHighlightWorkbookByRoom(week) 或 buildHighlightWorkbookByWeekday(week)
 *   2. 将 workbook 写为 Buffer，保存为临时 .xlsx 文件
 *   3. 使用 WeChatFileSender.sendExcelFile(tempPath, { week }) 上传并发送到群
 *
 * 相关代码位置：
 *   - 发送工具类：  server/src/utils/wechat.ts  WeChatFileSender.sendExcelFile()
 *   - Excel 构建：  server/src/routes/export.ts  buildHighlightWorkbookByRoom() / buildHighlightWorkbookByWeekday()
 *   - 原路由实现：  server/src/routes/export.ts  GET /highlight-by-week/room?sendToWechat=true
 *                                                GET /highlight-by-week/weekday?sendToWechat=true
 *
 * 原前端入口：
 *   client/src/pages/WeeklyExportPage.tsx（已删除）
 *   调用 exportHighlightByWeekRoomWithSend(week, true)
 *       exportHighlightByWeekWeekdayWithSend(week, true)
 *   对应 client/src/services/scheduleService.ts 中同名函数（仍保留）
 */

export {};
