<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import Sortable, { type SortableEvent } from 'sortablejs'
import arrowDownToLineIcon from './assets/arrow-down-to-line.svg?raw'
import barsIcon from './assets/bars.svg?raw'
import trashIcon from './assets/trash.svg?raw'

interface EditableLine {
  id: number
  text: string
}

type AlertType = 'success' | 'warning' | 'info' | 'error'

interface AppAlert {
  id: number
  message: string
  type: AlertType
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BlobPart): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemEntryDataTransferItem extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemFileHandle | null>
}

interface OpenFilePickerOptions {
  multiple?: boolean
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

interface WindowWithFilePicker extends Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
}

const { t } = useI18n()

const fileName = ref('')
const lineEnding = ref('\n')
const hasTrailingLineEnding = ref(false)
const savedContent = ref('')
const lines = ref<EditableLine[]>([])
const fileHandle = ref<FileSystemFileHandle | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const lineListRef = ref<HTMLElement | null>(null)
const isDraggingFile = ref(false)
const hideCommentLines = ref(false)
const hideBlankLines = ref(false)
const alert = ref<AppAlert | null>(null)
const nextLineId = ref(1)
const filePickerConfirmed = ref(false)
let sortable: Sortable | null = null
let dragDepth = 0
let alertTimeout: number | undefined

const COMMENT_PREFIXES = [';', '#', '//'] as const

const lineInputStyle = {
  minHeight: '40px',
  paddingBlock: '8px',
  borderRadius: '12px',
  fontFamily: 'var(--mono)',
  lineHeight: '22px',
} satisfies CSSProperties

const hasFile = computed(() => fileName.value.length > 0)
const lineCount = computed(() => lines.value.length)
const isDirty = computed(() => hasFile.value && buildContent() !== savedContent.value)
const hiddenLineCount = computed(() =>
  lines.value.filter((line) => getHiddenLineReason(line) !== null).length,
)

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function buildContent(): string {
  const content = lines.value.map((line) => line.text).join(lineEnding.value)

  return hasTrailingLineEnding.value ? `${content}${lineEnding.value}` : content
}

function detectLineEnding(content: string): string {
  const match = content.match(/\r\n|\n|\r/)

  return match?.[0] ?? '\n'
}

function createEditableLines(content: string): EditableLine[] {
  const sourceLines = content.length === 0 ? [''] : content.split(/\r\n|\n|\r/)
  const visibleLines = hasTrailingLineEnding.value ? sourceLines.slice(0, -1) : sourceLines

  return visibleLines.map((text) => ({
    id: nextLineId.value++,
    text,
  }))
}

function isCommentLine(text: string): boolean {
  const normalizedText = text.trimStart()

  return COMMENT_PREFIXES.some((prefix) => normalizedText.startsWith(prefix))
}

function isBlankLine(text: string): boolean {
  return text.trim().length === 0
}

function getHiddenLineReason(line: EditableLine): 'comment' | 'blank' | null {
  if (hideCommentLines.value && isCommentLine(line.text)) {
    return 'comment'
  }

  if (hideBlankLines.value && isBlankLine(line.text)) {
    return 'blank'
  }

  return null
}

function showAlert(message: string, type: AlertType = 'info'): void {
  window.clearTimeout(alertTimeout)
  alert.value = {
    id: Date.now(),
    message,
    type,
  }
  alertTimeout = window.setTimeout(() => {
    alert.value = null
  }, 3200)
}

function closeAlert(): void {
  window.clearTimeout(alertTimeout)
  alert.value = null
}

async function confirmDiscardUnsavedChanges(): Promise<boolean> {
  if (!isDirty.value) {
    return true
  }

  try {
    await ElMessageBox.confirm(
      t('editor.discardUnsavedMessage'),
      t('editor.discardUnsavedTitle'),
      {
        confirmButtonText: t('editor.discardUnsavedAccept'),
        cancelButtonText: t('editor.discardUnsavedCancel'),
        customClass: 'discard-unsaved-dialog',
        distinguishCancelAndClose: true,
        modalClass: 'discard-unsaved-overlay',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

async function readFile(file: File, handle: FileSystemFileHandle | null = null): Promise<void> {
  const content = await file.text()

  fileName.value = file.name
  lineEnding.value = detectLineEnding(content)
  hasTrailingLineEnding.value = /(\r\n|\n|\r)$/.test(content)
  savedContent.value = content
  fileHandle.value = handle
  lines.value = createEditableLines(content)
  await nextTick()
  initLineSortable()
  showAlert(t('editor.loaded', { name: file.name }), 'success')
}

async function getDroppedFileHandle(
  event: DragEvent,
): Promise<FileSystemFileHandle | null> {
  const item = Array.from(event.dataTransfer?.items ?? []).find(
    (dataItem) => dataItem.kind === 'file',
  ) as FileSystemEntryDataTransferItem | undefined

  if (!item?.getAsFileSystemHandle) {
    return null
  }

  return item.getAsFileSystemHandle()
}

async function handleFileDrop(event: DragEvent): Promise<void> {
  isDraggingFile.value = false

  const file = event.dataTransfer?.files.item(0)

  if (!file) {
    return
  }

  const handle = await getDroppedFileHandle(event)
  const canReplaceFile = await confirmDiscardUnsavedChanges()

  if (!canReplaceFile) {
    return
  }

  await readFile(file, handle)
}

function handleWindowDragOver(event: DragEvent): void {
  if (!isFileDrag(event)) {
    return
  }

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isDraggingFile.value = true
}

function handleWindowDragEnter(event: DragEvent): void {
  if (!isFileDrag(event)) {
    return
  }

  event.preventDefault()
  dragDepth += 1
  isDraggingFile.value = true
}

function handleWindowDragLeave(event: DragEvent): void {
  if (!isFileDrag(event)) {
    return
  }

  dragDepth = Math.max(0, dragDepth - 1)

  if (dragDepth === 0) {
    isDraggingFile.value = false
  }
}

async function handleWindowDrop(event: DragEvent): Promise<void> {
  if (!isFileDrag(event)) {
    return
  }

  event.preventDefault()
  dragDepth = 0
  await handleFileDrop(event)
}

async function openFilePicker(): Promise<void> {
  const canReplaceFile = await confirmDiscardUnsavedChanges()

  if (!canReplaceFile) {
    return
  }

  const browserWindow = window as WindowWithFilePicker

  if (!browserWindow.showOpenFilePicker) {
    filePickerConfirmed.value = true
    fileInputRef.value?.click()
    return
  }

  try {
    const [handle] = await browserWindow.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: t('editor.textFiles'),
          accept: {
            'text/plain': ['.txt', '.ini', '.cfg', '.conf', '.log'],
          },
        },
      ],
    })

    if (!handle) {
      return
    }

    const file = await handle.getFile()

    await readFile(file, handle)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    throw error
  }
}

async function handleFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.item(0)

  if (!file) {
    return
  }

  if (!filePickerConfirmed.value) {
    const canReplaceFile = await confirmDiscardUnsavedChanges()

    if (!canReplaceFile) {
      input.value = ''
      return
    }
  }

  filePickerConfirmed.value = false
  await readFile(file)
  input.value = ''
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!isDirty.value) {
    return
  }

  event.preventDefault()
  Reflect.set(event, 'returnValue', '')
}

function handleLineSortEnd(event: SortableEvent): void {
  if (!lineListRef.value || event.oldIndex === event.newIndex) {
    return
  }

  const visibleSlots = lines.value
    .map((line, index) => (getHiddenLineReason(line) === null ? index : -1))
    .filter((index) => index !== -1)
  const visibleLineElements = Array.from(
    lineListRef.value.querySelectorAll<HTMLElement>('.line-row:not(.line-row--filtered)'),
  )
  const sortedVisibleLineIds = visibleLineElements.map((element) => Number(element.dataset.lineId))
  const linesById = new Map(lines.value.map((line) => [line.id, line]))
  const updatedLines = [...lines.value]

  visibleSlots.forEach((slotIndex, visibleIndex) => {
    const line = linesById.get(sortedVisibleLineIds[visibleIndex])

    if (line) {
      updatedLines[slotIndex] = line
    }
  })

  lines.value = updatedLines
}

function initLineSortable(): void {
  if (!lineListRef.value) {
    return
  }

  sortable?.destroy()
  sortable = Sortable.create(lineListRef.value, {
    animation: 180,
    chosenClass: 'line-row--chosen',
    draggable: '.line-row',
    dragClass: 'line-row--dragging',
    ghostClass: 'line-row--ghost',
    handle: '.line-row__handle',
    onEnd: handleLineSortEnd,
  })
}

async function addLineAt(index: number): Promise<void> {
  const updatedLines = [...lines.value]
  const insertedLine = {
    id: nextLineId.value++,
    text: '',
  }

  updatedLines.splice(index, 0, insertedLine)
  lines.value = updatedLines
  await nextTick()
  initLineSortable()
  lineListRef.value?.querySelector(`[data-line-id="${insertedLine.id}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  })
}

async function deleteLineAt(index: number): Promise<void> {
  lines.value = lines.value.filter((_, lineIndex) => lineIndex !== index)
  await nextTick()
  initLineSortable()
}

function downloadEditedFile(content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName.value || 'edited.txt'
  link.click()
  URL.revokeObjectURL(url)
}

async function saveFile(): Promise<void> {
  if (!hasFile.value) {
    showAlert(t('editor.noFileWarning'), 'warning')
    return
  }

  const content = buildContent()

  if (fileHandle.value) {
    const writable = await fileHandle.value.createWritable()

    await writable.write(content)
    await writable.close()
    savedContent.value = content
    showAlert(t('editor.savedToFile'), 'success')
    return
  }

  downloadEditedFile(content)
  savedContent.value = content
  showAlert(t('editor.downloaded'), 'info')
}

onMounted(() => {
  window.addEventListener('dragenter', handleWindowDragEnter)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('dragleave', handleWindowDragLeave)
  window.addEventListener('drop', handleWindowDrop)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', handleWindowDragEnter)
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('dragleave', handleWindowDragLeave)
  window.removeEventListener('drop', handleWindowDrop)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.clearTimeout(alertTimeout)
  sortable?.destroy()
})
</script>

<template>
  <main class="editor-shell">
    <teleport to="body">
      <transition name="app-alert">
        <div
          v-if="alert"
          class="app-alert-viewport"
        >
          <el-alert
            class="app-alert"
            :closable="true"
            :title="alert.message"
            :type="alert.type"
            show-icon
            @close="closeAlert"
          />
        </div>
      </transition>
    </teleport>

    <section
      class="drop-panel"
      @dragenter.prevent="isDraggingFile = true"
      @dragover.prevent="isDraggingFile = true"
      @dragleave.prevent="isDraggingFile = false"
      @drop.prevent="handleFileDrop"
    >
      <div class="drop-panel__copy">
        <p class="eyebrow">{{ t('editor.eyebrow') }}</p>
        <h1>{{ t('editor.title') }}</h1>
        <p>{{ t('editor.description') }}</p>
      </div>

      <div class="drop-panel__actions">
        <input
          ref="fileInputRef"
          accept=".txt,.ini,.cfg,.conf,.log,text/plain"
          class="native-file-input"
          type="file"
          @change="handleFileInput"
        >
        <button
          class="action-button action-button--secondary"
          type="button"
          @click="openFilePicker"
        >
          {{ t('editor.chooseFile') }}
        </button>
        <el-button
          v-if="hasFile"
          class="action-button action-button--primary"
          type="primary"
          @click="saveFile"
        >
          {{ t('editor.save') }}
        </el-button>
      </div>
    </section>

    <section class="workspace">
      <div class="workspace__header">
        <div>
          <p class="workspace__label">{{ t('editor.currentFile') }}</p>
          <div class="workspace__file">
            <strong>{{ hasFile ? fileName : t('editor.noFile') }}</strong>
            <el-tag
              v-if="isDirty"
              effect="plain"
              type="warning"
            >
              {{ t('editor.unsaved') }}
            </el-tag>
          </div>
        </div>
        <div class="workspace__meta">
          <span>{{ t('editor.lineCount', { count: lineCount }) }}</span>
          <span
            v-if="hiddenLineCount > 0"
            class="workspace__hidden-count"
          >
            {{ t('editor.hiddenLineCount', { count: hiddenLineCount }) }}
          </span>
        </div>
      </div>

      <div
        v-if="hasFile"
        class="filter-bar"
      >
        <span class="filter-bar__label">{{ t('editor.filters') }}</span>
        <button
          class="filter-chip"
          :class="{ 'filter-chip--active': hideCommentLines }"
          type="button"
          @click="hideCommentLines = !hideCommentLines"
        >
          {{ t('editor.filterComments') }}
        </button>
        <button
          class="filter-chip"
          :class="{ 'filter-chip--active': hideBlankLines }"
          type="button"
          @click="hideBlankLines = !hideBlankLines"
        >
          {{ t('editor.filterBlankLines') }}
        </button>
      </div>

      <div
        v-if="hasFile"
        class="line-help"
      >
        <span>
          <i
            class="line-help__icon line-help__icon--up"
            v-html="arrowDownToLineIcon"
          />
          {{ t('editor.lineHelpInsertAbove') }}
        </span>
        <span>
          <i
            class="line-help__icon"
            v-html="arrowDownToLineIcon"
          />
          {{ t('editor.lineHelpInsertBelow') }}
        </span>
        <span>
          <i
            class="line-help__icon line-help__icon--delete"
            v-html="trashIcon"
          />
          {{ t('editor.lineHelpDelete') }}
        </span>
        <span>
          <i
            class="line-help__icon"
            v-html="barsIcon"
          />
          {{ t('editor.lineHelpDrag') }}
        </span>
      </div>

      <div
        v-if="hasFile"
        ref="lineListRef"
        class="line-list"
      >
        <article
          v-for="(line, index) in lines"
          :key="line.id"
          class="line-row"
          :class="{ 'line-row--filtered': getHiddenLineReason(line) !== null }"
          :data-line-id="line.id"
        >
          <div class="line-row__line-actions">
            <button
              class="line-row__line-button line-row__line-button--up"
              type="button"
              :aria-label="t('editor.addLineAbove', { line: index + 1 })"
              @click="addLineAt(index)"
              v-html="arrowDownToLineIcon"
            />
            <button
              class="line-row__line-button line-row__line-button--down"
              type="button"
              :aria-label="t('editor.addLineBelow', { line: index + 1 })"
              @click="addLineAt(index + 1)"
              v-html="arrowDownToLineIcon"
            />
            <button
              class="line-row__line-button line-row__line-button--delete"
              type="button"
              :aria-label="t('editor.deleteLine', { line: index + 1 })"
              @click="deleteLineAt(index)"
              v-html="trashIcon"
            />
          </div>
            <button
              class="line-row__handle"
              type="button"
              :aria-label="t('editor.dragLine', { line: index + 1 })"
              v-html="barsIcon"
            />
          <span class="line-row__number">{{ index + 1 }}</span>
          <el-input
            v-model="line.text"
            class="line-row__input"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :input-style="lineInputStyle"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            type="textarea"
          />
        </article>
      </div>

      <div
        v-else
        class="empty-state"
        :class="{ 'empty-state--active': isDraggingFile }"
      >
        {{ t('editor.emptyState') }}
      </div>
    </section>
  </main>
</template>
