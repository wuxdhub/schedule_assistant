import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { message } from 'antd';
import api from '../services/api';

interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  loginAsUser: () => Promise<void>; // 普通用户模式，无需登录
  logout: () => void;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 检查本地存储的token或用户类型
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (token) {
      // 管理员模式，需要验证token
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserInfo();
    } else if (userType === 'user') {
      // 普通用户模式，直接设置
      setUser({
        id: 'guest',
        username: '普通用户',
        role: 'user'
      });
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await api.get('/auth/me');
      // API响应拦截器已经处理了response.data，所以这里直接使用response
      if (response.success) {
        setUser(response.data);
      } else {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await api.post('/auth/login', { username, password });
      if (response.success) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(user);
        message.success('登录成功');
        return true;
      } else {
        message.error(response.message || '登录失败');
        return false;
      }
    } catch (error: any) {
      // 处理错误响应
      const errorMessage = error.response?.data?.message || error.message || '登录失败，请检查用户名和密码';
      console.error('登录错误:', error);
      message.error(errorMessage);
      return false;
    }
  };

  const loginAsUser = (): Promise<void> => {
    return new Promise((resolve) => {
      // 清除管理员token（如果有）
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      // 设置普通用户模式
      localStorage.setItem('userType', 'user');
      const guestUser: User = {
        id: 'guest',
        username: '普通用户',
        role: 'user'
      };
      // 同步设置用户状态
      setUser(guestUser);
      setLoading(false);
      // 使用 setTimeout 确保状态更新完成
      setTimeout(() => {
        resolve();
      }, 0);
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    message.success('已退出登录');
  };

  const isAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsUser, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

