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

const { Sider, Header } = Layout;

const AppSidebar = () => {
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
      label: '课表上传'
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
    <Sider
      width={200}
      style={{
        background: '#001529',
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0
      }}
    >
      <div
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '18px',
          fontWeight: 'bold',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        机房课表助手
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ height: 'calc(100% - 64px)', borderRight: 0 }}
        theme="dark"
      />
    </Sider>
  );
};

export const AppTopBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        background: '#fafafa',
        padding: '0 24px',
        borderBottom: '1px solid #e8e8e8',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        position: 'fixed',
        top: 0,
        right: 0,
        left: 200,
        zIndex: 1
      }}
    >
      {user && (
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Button type="text" icon={<UserOutlined />}>
            {user.username} ({user.role === 'admin' ? '管理员' : '普通用户'})
          </Button>
        </Dropdown>
      )}
    </Header>
  );
};

export default AppSidebar;

