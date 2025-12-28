import { useState } from 'react';
import { Form, Input, Button, Card, message, Radio, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, TeamOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState<'user' | 'admin'>('user');
  const { login, loginAsUser } = useAuth();
  const navigate = useNavigate();

  const handleUserTypeChange = (e: any) => {
    setUserType(e.target.value);
  };

  const handleUserLogin = async () => {
    await loginAsUser();
    navigate('/schedule');
  };

  const onAdminLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    const success = await login(values.username, values.password);
    setLoading(false);
    if (success) {
      navigate('/schedule');
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        title={
          <div style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>
            机房智能预约与课表管理系统
          </div>
        }
        style={{ width: 450, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
      >
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>选择用户类型：</div>
          <Radio.Group 
            value={userType} 
            onChange={handleUserTypeChange}
            style={{ width: '100%' }}
            size="large"
          >
            <Radio.Button value="user" style={{ width: '50%', textAlign: 'center' }}>
              <TeamOutlined /> 普通用户
            </Radio.Button>
            <Radio.Button value="admin" style={{ width: '50%', textAlign: 'center' }}>
              <SafetyOutlined /> 管理员
            </Radio.Button>
          </Radio.Group>
        </div>

        {userType === 'user' ? (
          <div>
            <div style={{ 
              padding: '20px', 
              background: '#f0f2f5', 
              borderRadius: '4px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <TeamOutlined style={{ fontSize: '32px', color: '#1890ff', marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', color: '#666', marginBottom: '8px' }}>
                普通用户模式
              </div>
              <div style={{ fontSize: '14px', color: '#999' }}>
                无需登录，可直接查看课表和查询机房
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={<TeamOutlined />}
              onClick={handleUserLogin}
            >
              进入系统（普通用户）
            </Button>
          </div>
        ) : (
          <Form
            name="adminLogin"
            onFinish={onAdminLogin}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="管理员用户名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="管理员密码"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={<SafetyOutlined />}
              >
                管理员登录
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
};

export default LoginPage;

