import { Layout, Menu, Button, Dropdown } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  UploadOutlined,
  SearchOutlined,
  CalendarOutlined,
  ExportOutlined,
  UserOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Header } = Layout;

const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();

  // 基础菜单项（所有用户共有）
  const baseMenuItems = [
    {
      key: '/schedule',
      icon: <CalendarOutlined />,
      label: '课表管理'
    },
    {
      key: '/query',
      icon: <SearchOutlined />,
      label: '智能查询'
    }
  ];

  // 管理员专用菜单项
  const adminMenuItems = [
    {
      key: '/weekly-export',
      icon: <ExportOutlined />,
      label: '周次筛选导出'
    },
    {
      key: '/import',
      icon: <UploadOutlined />,
      label: '数据导入'
    }
  ];

  // 根据用户角色组合菜单
  const menuItems = isAdmin() ? [...baseMenuItems, ...adminMenuItems] : baseMenuItems;

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        navigate('/login');
      }
    }
  ];

  return (
    <Header
      style={{
        background: '#fff',
        padding: '0 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 'bold',
            marginRight: '40px',
            color: '#1890ff'
          }}
        >
          机房智能预约与课表管理系统
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, borderBottom: 'none' }}
        />
        {user && (
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />} style={{ marginLeft: '16px' }}>
              {user.username} ({user.role === 'admin' ? '管理员' : '普通用户'})
            </Button>
          </Dropdown>
        )}
      </div>
    </Header>
  );
};

export default AppHeader;

