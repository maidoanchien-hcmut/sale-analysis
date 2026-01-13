<script setup lang="ts">
import { ref, onMounted } from 'vue'

const BACKEND_API = 'http://localhost:8080/api/process'
const DASHBOARD_API = 'http://localhost:8080/api/dashboard'

const selectedFile = ref<File | null>(null)
const loading = ref(false)
const result = ref<any | null>(null)
const error = ref<string | null>(null)
const dashboard = ref<any | null>(null)

function isValidSessionJson(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false
  if (!Array.isArray(obj.messages)) return false
  if (obj.messages.length === 0) return false
  const first = obj.messages[0]
  if (!first) return false
  return (
    typeof first.sender_name === 'string' && first.sender_name.length > 0 &&
    typeof first.timestamp === 'string' && first.timestamp.length > 0 &&
    typeof first.content === 'string'
  )
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.item(0) ?? null
  if (!f) {
    selectedFile.value = null
    return
  }

  try {
    const text = await f.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (parseErr) {
      selectedFile.value = null
      error.value = 'Invalid JSON: could not parse file.'
      return
    }

    if (!isValidSessionJson(parsed)) {
      selectedFile.value = null
      error.value = 'Invalid format: expected {"messages": [{"sender_name","timestamp","content"}, ...] }'
      return
    }

    selectedFile.value = f
    result.value = null
    error.value = null
  } catch (err: any) {
    selectedFile.value = null
    error.value = err?.message || 'Error reading file'
  }
}

async function upload() {
  if (!selectedFile.value) {
    error.value = 'Please select a valid JSON file first.'
    return
  }

  loading.value = true
  error.value = null
  result.value = null

  const form = new FormData()
  form.append('file', selectedFile.value, selectedFile.value.name)

  try {
    const resp = await fetch(BACKEND_API, {
      method: 'POST',
      body: form,
    })

    if (!resp.ok) {
      const body = await resp.json().catch(() => null)
      const msg = body && body.message ? body.message : `Server returned ${resp.status}`
      throw new Error(msg)
    }

    const data = await resp.json()
    result.value = data
  } catch (err: any) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

// Fetch dashboard data on mount
onMounted(async () => {
  try {
    const resp = await fetch(DASHBOARD_API)
    if (!resp.ok) throw new Error('Failed to load dashboard')
    dashboard.value = await resp.json()
  } catch (err: any) {
    dashboard.value = { total_sessions: 0, total_customers: 0, total_purchases: 0, total_complaints: 0 }
  }
})
</script>

<template>
  <div class="popup">
    <h1 class="title">Sale Analysis</h1>

    <div class="dashboard">
      <h2 class="dashboard-title">Dashboard</h2>
      <div class="metric"><b>Total Sessions:</b> {{ dashboard?.total_sessions ?? 0 }}</div>

      <div class="group">
        <div class="group-title">By Customer Type</div>
        <ul>
          <li v-for="(v,k) in dashboard?.sessions_by_customer_type || {}" :key="'cust-'+k">{{ k }}: {{ v }}</li>
        </ul>
      </div>

      <div class="group">
        <div class="group-title">By Outcome</div>
        <ul>
          <li v-for="(v,k) in dashboard?.sessions_by_outcome || {}" :key="'out-'+k">{{ k }}: {{ v }}</li>
        </ul>
      </div>

      <div class="group">
        <div class="group-title">By Quality</div>
        <ul>
          <li v-for="(v,k) in dashboard?.sessions_by_quality || {}" :key="'qual-'+k">{{ k }}: {{ v }}</li>
        </ul>
      </div>

      <div class="group">
        <div class="group-title">By Risk</div>
        <ul>
          <li v-for="(v,k) in dashboard?.sessions_by_risk || {}" :key="'risk-'+k">{{ k }}: {{ v }}</li>
        </ul>
      </div>
    </div>

    <div class="row">
      <input id="file" type="file" accept="application/json" @change="onFileChange" />
    </div>

    <div class="row actions">
      <button :disabled="!selectedFile || loading" @click="upload">Process</button>
    </div>

    <div class="status">
      <div v-if="loading" class="loading">Processing…</div>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="result" class="result">Done — {{ Array.isArray(result) ? result.length + ' sessions' : 'response' }}</div>
    </div>

    <small class="muted">Sends file to local backend at <code>http://localhost:8080</code></small>
  </div>
</template>

<style scoped>
.popup {
  width: 300px;
  padding: 10px;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial;
}
.title { font-size: 14px; margin: 0 0 6px; }
.dashboard { background: #f6f7f9; border-radius: 8px; padding: 8px; margin-bottom: 10px; }
.dashboard-title { font-size: 13px; margin-bottom: 4px; color: #2563eb; }
.metric { font-size: 12px; margin-bottom: 6px; }
.group { margin-bottom: 8px; }
.group-title { font-size: 12px; color:#374151; margin-bottom: 4px; }
ul { list-style: none; padding: 0; margin: 0; }
li { font-size: 11.5px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row { margin-bottom: 8px; }
.actions { display: flex; justify-content: flex-end; }
button { background: #2563eb; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.loading { color: #2563eb; font-size: 12px; }
.error { color: #b91c1c; font-size: 12px; }
.result { color: #064e3b; font-size: 12px; }
.muted { display:block; margin-top:8px; color:#6b7280; font-size:11px }
code { font-size:11px }
</style>