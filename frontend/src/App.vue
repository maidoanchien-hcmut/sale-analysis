<script setup lang="ts">
import { ref } from 'vue'

const selectedFile = ref<File | null>(null)
const loading = ref(false)
const result = ref<any | null>(null)
const error = ref<string | null>(null)

const exampleSnippet = `{
  "messages": [
    { "sender_name": "customer", "timestamp": "2026-02-01T09:15:00Z", "content": "Chào shop, cho mình hỏi giá lấy nhân mụn với." },
    { "sender_name": "page", "timestamp": "2026-02-01T09:16:45Z", "content": "Chào bạn, Thảo là tư vấn viên O2 SKIN ạ..." },
    { "sender_name": "customer", "timestamp": "2026-02-01T09:18:10Z", "content": "Tên Minh nha. Mình là sinh viên." }
  ]
}`

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  // Use .item(0) which returns File | null to satisfy TypeScript
  const f = input.files?.item(0) ?? null
  if (f) {
    selectedFile.value = f
    result.value = null
    error.value = null
  } else {
    selectedFile.value = null
  }
}

async function upload() {
  if (!selectedFile.value) {
    error.value = 'Please select a JSON file first.'
    return
  }

  loading.value = true
  error.value = null
  result.value = null

  const form = new FormData()
  form.append('file', selectedFile.value, selectedFile.value.name)

  try {
    const resp = await fetch('/api/process', {
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
</script>

<template>
  <div class="container">
    <h1>Sale Analysis — Upload</h1>

    <section class="panel">
      <h2>Example input (read-only)</h2>
      <p class="muted">This is a small excerpt from the sample JSON shown as an example; you cannot edit it here.</p>
      <pre class="example"><code>{{ exampleSnippet }}</code></pre>
    </section>

    <section class="panel">
      <h2>Upload your JSON</h2>
      <input type="file" accept="application/json" @change="onFileChange" />
      <div class="actions">
        <button :disabled="!selectedFile || loading" @click="upload">Upload & Process</button>
        <span v-if="selectedFile" class="file-name">{{ selectedFile.name }}</span>
      </div>

      <div class="status">
        <div v-if="loading" class="loading">Processing... please wait</div>
        <div v-if="error" class="error">Error: {{ error }}</div>
        <div v-if="result" class="result">
          <h3>Result</h3>
          <pre><code>{{ JSON.stringify(result, null, 2) }}</code></pre>
        </div>
      </div>
    </section>

    <footer>
      <small>Backend endpoint: <code>/api/process</code></small>
    </footer>
  </div>
</template>

<style scoped>
.container {
  max-width: 900px;
  margin: 36px auto;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  padding: 0 16px;
  box-sizing: border-box;
}

.panel {
  background: #fff;
  border: 1px solid #e6e6e6;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  width: 100%;
  box-sizing: border-box;
}

.example {
  background: #0f1724;
  color: #e6eef8;
  padding: 12px;
  border-radius: 6px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
  max-height: 60vh;
}

.actions {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  min-width: 140px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-name {
  font-size: 0.9rem;
  color: #333;
  max-width: calc(100% - 160px);
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading {
  color: #2563eb;
  margin-top: 8px;
}

.error {
  color: #b91c1c;
  margin-top: 8px;
}

.result pre {
  background: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.muted {
  color: #6b7280;
}

footer {
  text-align: center;
  margin-top: 24px;
  color: #6b7280;
}

@media (max-width: 600px) {
  .container { margin: 20px auto; padding: 0 12px; }
  h1 { font-size: 1.25rem; }
  .example { font-size: 0.9rem; }
  .file-name { max-width: 100%; }
  button { min-width: 0; width: 100%; }
}
</style>
