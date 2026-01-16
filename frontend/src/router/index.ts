import { createRouter, createWebHistory } from 'vue-router'
import CustomerHealthView from '@/views/CustomerHealthView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'customer-health',
      component: CustomerHealthView,
    },
    {
      path: '/risks',
      name: 'risk-liability',
      component: () => import('@/views/RiskAnalysisView.vue'),
    },
    {
      path: '/staff',
      name: 'staff-performance',
      component: () => import('@/views/StaffPerformanceView.vue'),
    },
    {
      path: '/root-cause',
      name: 'root-cause',
      component: () => import('@/views/ReportsView.vue'),
    },
    {
      path: '/evidence',
      name: 'evidence',
      component: () => import('@/views/EvidenceView.vue'),
    },
  ],
})

export default router
