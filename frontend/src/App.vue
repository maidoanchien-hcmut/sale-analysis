<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Search,
  FileText,
  Menu,
  X
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)

const navigation = [
  { name: 'Mức hài lòng của KH', href: '/', icon: LayoutDashboard },
  { name: 'Rủi ro & Trách nhiệm', href: '/risks', icon: AlertTriangle },
  { name: 'Hiệu suất NV', href: '/staff', icon: Users },
  { name: 'Nguyên nhân gốc', href: '/root-cause', icon: Search },
  { name: 'Bằng chứng', href: '/evidence', icon: FileText },
]

function isActive(href: string) {
  return route.path === href
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Mobile sidebar backdrop -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      @click="sidebarOpen = false"
    ></div>

    <!-- Sidebar -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-lg transition-transform duration-200 lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      ]"
    >
      <div class="flex h-16 items-center justify-between border-b px-4">
        <div class="flex items-center gap-2">
          <div class="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span class="text-white font-bold text-sm">O2</span>
          </div>
          <span class="font-semibold text-gray-900">CS Analytics</span>
        </div>
        <button
          @click="sidebarOpen = false"
          class="lg:hidden text-gray-500 hover:text-gray-700"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <nav class="p-4 space-y-1">
        <router-link
          v-for="item in navigation"
          :key="item.name"
          :to="item.href"
          :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive(item.href)
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          ]"
          @click="sidebarOpen = false"
        >
          <component :is="item.icon" class="h-5 w-5" />
          {{ item.name }}
        </router-link>
      </nav>
    </aside>

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top header -->
      <header class="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-4 shadow-sm">
        <button
          @click="sidebarOpen = true"
          class="lg:hidden text-gray-500 hover:text-gray-700"
        >
          <Menu class="h-6 w-6" />
        </button>
        <div class="flex-1">
          <h1 class="text-lg font-semibold text-gray-900">O2 SKIN Customer Service QA</h1>
        </div>
      </header>

      <!-- Page content -->
      <main class="p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped></style>
