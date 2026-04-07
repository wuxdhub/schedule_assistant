import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000 // 增加到5分钟（300秒），用于处理大型Excel文件导入
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    // 对于 blob 类型的响应，直接返回 response.data（已经是 Blob 对象）
    // 对于其他类型的响应，也返回 response.data
    return response.data;
  },
  async (error) => {
    // 对于 blob 类型的错误响应，尝试解析错误信息
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text();
        const errorData = JSON.parse(text);
        const message = errorData.error || error.message || '请求失败';
        return Promise.reject(new Error(message));
      } catch {
        const message = error.message || '请求失败';
        return Promise.reject(new Error(message));
      }
    }
    const message = error.response?.data?.error || error.message || '请求失败';
    // 把完整的 response data 附到错误对象上，供调用方使用
    const err = new Error(message) as any;
    err.responseData = error.response?.data;
    return Promise.reject(err);
  }
);

export default api;


