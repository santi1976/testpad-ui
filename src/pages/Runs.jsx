import React, { useState } from 'react'
import { Layout, Tabs, Button, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CreateAndAssign from './CreateAndAssign'
import AssignmentsAndEmail from './AssignmentsAndEmail'

const { Content } = Layout
const { Title } = Typography

export default function TestExecutions() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('create')

  const tabItems = [
    {
      key: 'create',
      label: 'Create Run',
      children: <CreateAndAssign embedded={true} />,
    },
    {
      key: 'assign',
      label: 'Assignments & Email',
      children: <AssignmentsAndEmail embedded={true} />,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Navbar />
      <Content style={{ padding: '24px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {/* Header with Back button */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/')}
            type="default"
          >
            Back to Projects
          </Button>
          <Title level={2} style={{ margin: 0 }}>Test Executions</Title>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
          style={{ marginBottom: 24 }}
        />
      </Content>
    </Layout>
  )
}

