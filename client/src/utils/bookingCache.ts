// 课程预约表单的内存缓存
// 模块级变量：SPA 切换页面不丢失，刷新或退出登录后清空
export interface FormCache {
  formValues: Record<string, any>;
  periodRules: string[];
  weekRules: string[];
}

let cache: FormCache | null = null;

export function getBookingCache(): FormCache | null {
  return cache;
}

export function setBookingCache(data: FormCache) {
  cache = data;
}

export function clearBookingCache() {
  cache = null;
}
