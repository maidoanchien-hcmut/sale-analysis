<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const BACKEND_API = 'http://localhost:8080/api/process'
const DASHBOARD_API = 'http://localhost:8080/api/dashboard'

const selectedFile = ref<File | null>(null)
const loading = ref(false)
const result = ref<any | null>(null)
const error = ref<string | null>(null)
const dashboard = ref<any | null>(null)

const custPie = ref<HTMLCanvasElement | null>(null)
const outcomePie = ref<HTMLCanvasElement | null>(null)
const outcomeBar = ref<HTMLCanvasElement | null>(null)

const palette: string[] = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#f43f5e','#22c55e','#e11d48']
function colorForKey(keys: string[], key: string): string {
  const idx = keys.indexOf(key)
  const i = idx >= 0 ? idx : 0
  const color = palette[i % palette.length]
  return color || '#2563eb'
}

function drawPie(canvas: HTMLCanvasElement, data: Record<string, number>) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const values = Object.values(data).map(v => typeof v === 'number' ? v : 0)
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return
  let start = -Math.PI / 2
  const keys = Object.keys(data)
  const pieRadius = Math.min(h, w/2) / 2 - 4
  const pieX = pieRadius + 4, pieY = h/2

  keys.forEach((k, i) => {
    const raw = data[k]
    const val = typeof raw === 'number' ? raw : 0
    const angle = (val / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(pieX, pieY)
    ctx.arc(pieX, pieY, pieRadius, start, start + angle)
    ctx.closePath()
    const color = colorForKey(keys, k)
    ctx.fillStyle = color
    ctx.fill()
    start += angle
  })

  ctx.font = '11px system-ui'
  const legendX = pieX + pieRadius + 15
  const legendY = 15
  keys.forEach((k, i) => {
    const y = legendY + i * 14
    const color = colorForKey(keys, k)
    ctx.fillStyle = color
    ctx.fillRect(legendX, y - 8, 10, 10)
    ctx.fillStyle = '#374151'
    ctx.fillText(`${k}: ${data[k]}`, legendX + 14, y)
  })
}

function drawBar(canvas: HTMLCanvasElement, data: Array<{label:string, value:number, color:string}>) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0,0,w,h)
  const safeData = data.map(d => ({ label: d.label ?? '', value: typeof d.value === 'number' ? d.value : 0, color: d.color || '#2563eb' }))
  const max = Math.max(1, ...safeData.map(d=>d.value))
  const barW = Math.max(6, Math.floor((w - 8) / Math.max(1, safeData.length)))
  ctx.font = '11px system-ui'
  ctx.textAlign = 'center'
  safeData.forEach((d, i) => {
    const x = 4 + i * barW
    const barH = Math.round((d.value / max) * (h - 28))
    ctx.fillStyle = d.color
    ctx.fillRect(x, h - barH - 14, barW - 2, barH)
    ctx.fillStyle = '#000000'
    ctx.fillText(d.value.toFixed(1), x + (barW-2)/2, h - barH - 2)
    ctx.fillStyle = '#000000'
    const label = outcomeAbbrev(d.label)
    ctx.fillText(label, x + (barW-2)/2, h - 2)
  })
}

function updateCharts() {
  if (!dashboard.value) return
  const outcomesDist: Record<string, number> = dashboard.value.sessions_by_outcome || {}
  const outcomeKeys = Object.keys(outcomesDist)
  if (custPie.value) drawPie(custPie.value, dashboard.value.sessions_by_customer_type || {})
  if (outcomePie.value) drawPie(outcomePie.value, outcomesDist)
  const avgByOutcome: Array<{label:string, value:number, color:string}> = []
  const avgData: Record<string, number> = dashboard.value.avg_response_by_outcome || {}
  outcomeKeys.forEach(k=>{
    avgByOutcome.push({label:k, value: avgData[k] ?? 0, color: colorForKey(outcomeKeys, k)})
  })
  if (outcomeBar.value) drawBar(outcomeBar.value, avgByOutcome)
}

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

    try {
      const dashResp = await fetch(DASHBOARD_API)
      if (dashResp.ok) {
        dashboard.value = await dashResp.json()
        updateCharts()
      }
    } catch {}
  } catch (err: any) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const resp = await fetch(DASHBOARD_API)
    if (!resp.ok) throw new Error('Failed to load dashboard')
    dashboard.value = await resp.json()
  } catch (err: any) {
    dashboard.value = { total_sessions: 0 }
  }
  updateCharts()
})

watch(dashboard, () => updateCharts())

function outcomeAbbrev(label: string): string {
  const map: Record<string,string> = {
    won_standard: 'w_s', won_upsell: 'w_u', won_downsell: 'w_d',
    lost_price: 'l_p', lost_fit: 'l_f', lost_competitor: 'l_c', lost_service: 'l_s',
    lost_stock: 'l_st', lost_logistics: 'l_l', lost_payment: 'l_pm',
    ghost_early: 'g_e', ghost_post_price: 'g_pp', ghost_checkout: 'g_co',
    spam_junk: 'spam', support_inquiry: 'sup', stalled: 'stl'
  }
  return map[label] || (label.length > 8 ? label.slice(0,8)+'…' : label)
}
</script>

<template>
  <div class="popup">
    <h1 class="title">Sale Analysis</h1>

    <div class="dashboard">
      <h2 class="dashboard-title">Dashboard</h2>
      <div class="metric"><b>Total Sessions:</b> {{ dashboard?.total_sessions ?? 0 }}</div>

      <div class="group">
        <div class="group-title">Customer Types</div>
        <canvas ref="custPie" width="260" height="120"></canvas>
      </div>

      <div class="group">
        <div class="group-title">Outcomes</div>
        <canvas ref="outcomePie" width="260" height="120"></canvas>
      </div>

      <div class="group">
        <div class="group-title">Avg Response Time (min) by Outcome</div>
        <canvas ref="outcomeBar" width="260" height="140"></canvas>
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
.popup { width: 300px; padding: 10px; box-sizing: border-box; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial; }
.title { font-size: 14px; margin: 0 0 6px; }
.dashboard { background: #f6f7f9; border-radius: 8px; padding: 8px; margin-bottom: 10px; }
.dashboard-title { font-size: 13px; margin-bottom: 4px; color: #2563eb; }
.metric { font-size: 12px; margin-bottom: 6px; }
.group { margin-bottom: 8px; }
.group-title { font-size: 12px; color:#374151; margin-bottom: 4px; }
.row { margin-bottom: 8px; }
.actions { display: flex; justify-content: flex-end; }
button { background: #2563eb; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.loading { color: #2563eb; font-size: 12px; }
.error { color: #b91c1c; font-size: 12px; }
.result { color: #064e3b; font-size: 12px; }
.muted { display:block; margin-top:8px; color:#6b7280; font-size:11px }
code { font-size:11px }
canvas { display:block; width: 260px; height: 120px; border-radius: 6px; background:#ffffff; }
</style>