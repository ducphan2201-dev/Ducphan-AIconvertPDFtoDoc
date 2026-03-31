// Polyfill cho Promise.withResolvers (hỗ trợ trình duyệt cũ/ES2024)
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// PDF Converter AI – Main Application
import { getApiKey, setApiKey, getModel, setModel, hasApiKey } from './utils/storage.js';
import { formatFileSize, downloadBlob, getFileNameWithoutExtension } from './utils/fileHelpers.js';
import { processPdf, getPageCount } from './services/pdfProcessor.js';
import { processPages, testApiKey } from './services/geminiService.js';
import { generateDocx } from './services/docxGenerator.js';

// ============ State ============
let uploadedFiles = [];
let selectedFormat = 'docx';
let isConverting = false;
let abortController = null;
let convertedResults = [];

// ============ DOM Elements ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Sections
const onboardingSection = $('#onboardingSection');
const uploadSection = $('#uploadSection');
const formatSection = $('#formatSection');
const progressSection = $('#progressSection');
const resultSection = $('#resultSection');

// Guide
const guideBtn = $('#guideBtn');
const openSettingsFromGuide = $('#openSettingsFromGuide');

// Upload
const dropZone = $('#dropZone');
const fileInput = $('#fileInput');
const filePreview = $('#filePreview');
const fileList = $('#fileList');

// Format
const formatCards = $$('.format-card');
const convertBtn = $('#convertBtn');

// Progress
const progressPercent = $('.progress-percent');
const progressFill = $('.progress-ring-fill');
const progressStatus = $('.progress-status');
const progressPage = $('.progress-page');
const progressSteps = $$('.p-step');
const cancelBtn = $('#cancelBtn');

// Results
const resultFiles = $('#resultFiles');
const togglePreview = $('#togglePreview');
const previewContent = $('#previewContent');
const convertAnotherBtn = $('#convertAnotherBtn');

// Settings
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const closeSettings = $('#closeSettings');
const apiKeyInput = $('#apiKeyInput');
const modelSelect = $('#modelSelect');
const toggleKeyVisibility = $('#toggleKeyVisibility');
const testKeyBtn = $('#testKeyBtn');
const testResult = $('#testResult');
const saveSettings = $('#saveSettings');

// ============ Toast System ============
function showToast(message, type = 'info', duration = 4000) {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============ Section Navigation ============
function showSection(sectionId) {
  [onboardingSection, uploadSection, formatSection, progressSection, resultSection].forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('active');
  });
  const target = $(`#${sectionId}`);
  target.classList.remove('hidden');
  target.classList.add('active');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============ File Upload ============
function handleFiles(files) {
  const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
  
  if (pdfFiles.length === 0) {
    showToast('Vui lòng chọn file PDF', 'warning');
    return;
  }
  
  for (const file of pdfFiles) {
    if (file.size > 50 * 1024 * 1024) {
      showToast(`${file.name} quá lớn (max 50MB)`, 'error');
      continue;
    }
    if (!uploadedFiles.find(f => f.name === file.name && f.size === file.size)) {
      uploadedFiles.push(file);
    }
  }
  
  renderFileList();
}

async function renderFileList() {
  if (uploadedFiles.length === 0) {
    filePreview.classList.add('hidden');
    formatSection.classList.add('hidden');
    return;
  }
  
  filePreview.classList.remove('hidden');
  formatSection.classList.remove('hidden');
  fileList.innerHTML = '';
  
  for (const file of uploadedFiles) {
    let pageCount = '...';
    try {
      pageCount = await getPageCount(file);
    } catch (e) {
      pageCount = '?';
    }
    
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-item-icon">PDF</div>
      <div class="file-item-info">
        <div class="file-item-name">${file.name}</div>
        <div class="file-item-meta">${formatFileSize(file.size)} • ${pageCount} trang</div>
      </div>
      <button class="file-item-remove" data-name="${file.name}" title="Xóa">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    fileList.appendChild(item);
  }
}

// ============ File Upload Events ============
dropZone.addEventListener('click', (e) => {
  if (e.target.closest('.browse-btn') || e.target === dropZone || e.target.closest('.drop-zone-content')) {
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  fileInput.value = '';
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

// Remove file
fileList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.file-item-remove');
  if (removeBtn) {
    const name = removeBtn.dataset.name;
    uploadedFiles = uploadedFiles.filter(f => f.name !== name);
    renderFileList();
  }
});

// ============ Format Selection ============
formatCards.forEach(card => {
  card.addEventListener('click', () => {
    formatCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedFormat = card.dataset.format;
  });
});

// ============ Progress Helpers ============
function updateProgress(percent, status, page) {
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (percent / 100) * circumference;
  progressFill.style.strokeDashoffset = offset;
  progressPercent.textContent = `${Math.round(percent)}%`;
  if (status) progressStatus.textContent = status;
  if (page) progressPage.textContent = page;
}

function setProgressStep(stepName) {
  progressSteps.forEach(step => {
    const name = step.dataset.step;
    if (name === stepName) {
      step.classList.add('active');
      step.classList.remove('completed');
    } else if (
      (stepName === 'ocr' && name === 'read') ||
      (stepName === 'generate' && (name === 'read' || name === 'ocr'))
    ) {
      step.classList.remove('active');
      step.classList.add('completed');
    } else {
      step.classList.remove('active', 'completed');
    }
  });
}

// ============ Conversion ============
convertBtn.addEventListener('click', startConversion);

async function startConversion() {
  if (uploadedFiles.length === 0) {
    showToast('Vui lòng chọn file PDF', 'warning');
    return;
  }
  
  if (!hasApiKey()) {
    showToast('Vui lòng cài đặt API Key trước', 'warning');
    settingsModal.classList.remove('hidden');
    return;
  }
  
  isConverting = true;
  abortController = new AbortController();
  convertedResults = [];
  
  showSection('progressSection');
  updateProgress(0, 'Đang chuẩn bị...', '');
  setProgressStep('read');
  
  // Add SVG gradient for progress ring
  ensureProgressGradient();
  
  try {
    for (let fi = 0; fi < uploadedFiles.length; fi++) {
      const file = uploadedFiles[fi];
      const fileLabel = uploadedFiles.length > 1 ? ` (File ${fi + 1}/${uploadedFiles.length})` : '';
      
      // Step 1: Process PDF
      setProgressStep('read');
      updateProgress(5, `Đang đọc PDF...${fileLabel}`, `${file.name}`);
      
      const pdfData = await processPdf(file, (current, total) => {
        const pdfProgress = (current / total) * 25;
        updateProgress(5 + pdfProgress, `Đang render trang ${current}/${total}${fileLabel}`, `${file.name}`);
      });
      
      if (abortController.signal.aborted) throw new Error('Đã hủy');
      
      // Step 2: OCR with Gemini
      setProgressStep('ocr');
      updateProgress(30, `Đang OCR bằng AI...${fileLabel}`, `0/${pdfData.totalPages} trang`);
      
      const pageTexts = await processPages(
        pdfData.pages,
        (completed, total, status) => {
          const ocrProgress = (completed / total) * 50;
          updateProgress(30 + ocrProgress, status + fileLabel, `${completed}/${total} trang`);
        },
        abortController.signal
      );
      
      if (abortController.signal.aborted) throw new Error('Đã hủy');
      
      // Step 3: Generate output
      setProgressStep('generate');
      updateProgress(85, `Đang tạo file ${selectedFormat.toUpperCase()}...${fileLabel}`, '');
      
      const baseName = getFileNameWithoutExtension(file.name);
      let blob, outputName;
      
      switch (selectedFormat) {
        case 'docx':
          blob = await generateDocx(pageTexts, baseName, pdfData.pages);
          outputName = `${baseName}.docx`;
          break;
        case 'txt':
          blob = new Blob([pageTexts.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8' });
          outputName = `${baseName}.txt`;
          break;
        case 'md':
          blob = new Blob([pageTexts.join('\n\n---\n\n')], { type: 'text/markdown;charset=utf-8' });
          outputName = `${baseName}.md`;
          break;
      }
      
      convertedResults.push({
        blob,
        filename: outputName,
        size: blob.size,
        text: pageTexts.join('\n\n'),
        format: selectedFormat
      });
    }
    
    updateProgress(100, 'Hoàn tất!', '');
    
    // Show results
    setTimeout(() => {
      showResults();
    }, 500);
    
  } catch (error) {
    if (error.message === 'Đã hủy') {
      showToast('Đã hủy chuyển đổi', 'warning');
      showSection('uploadSection');
      formatSection.classList.remove('hidden');
    } else {
      showToast(`Lỗi: ${error.message}`, 'error', 6000);
      showSection('uploadSection');
      formatSection.classList.remove('hidden');
    }
  } finally {
    isConverting = false;
    abortController = null;
  }
}

function ensureProgressGradient() {
  if (!document.getElementById('progressGradDefs')) {
    const svg = document.querySelector('.progress-ring');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'progressGradDefs';
    defs.innerHTML = `
      <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00D4FF"/>
        <stop offset="100%" stop-color="#7C3AED"/>
      </linearGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
  }
}

// Cancel
cancelBtn.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

// ============ Results ============
function showResults() {
  showSection('resultSection');
  resultFiles.innerHTML = '';
  
  for (const result of convertedResults) {
    const formatIcons = {
      docx: '📄',
      txt: '📝',
      md: '📋'
    };
    
    const item = document.createElement('div');
    item.className = 'result-file';
    item.innerHTML = `
      <div class="file-item-icon" style="background: rgba(16,185,129,0.15); color: #10B981; font-size: 1.2rem;">
        ${formatIcons[result.format] || '📄'}
      </div>
      <div class="result-file-info">
        <div class="result-file-name">${result.filename}</div>
        <div class="result-file-size">${formatFileSize(result.size)}</div>
      </div>
      <button class="download-btn" data-filename="${result.filename}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Tải xuống
      </button>
    `;
    resultFiles.appendChild(item);
  }
  
  // Store preview text
  if (convertedResults.length > 0) {
    const cleanPreview = convertedResults[0].text.replace(/<br\s*\/?>/gi, '\n');
    previewContent.textContent = cleanPreview.substring(0, 5000);
    if (cleanPreview.length > 5000) {
      previewContent.textContent += '\n\n... (nội dung đã được cắt bớt)';
    }
  }
}

// Download handlers
resultFiles.addEventListener('click', (e) => {
  const btn = e.target.closest('.download-btn');
  if (btn) {
    const filename = btn.dataset.filename;
    const result = convertedResults.find(r => r.filename === filename);
    if (result) {
      downloadBlob(result.blob, result.filename);
      showToast(`Đã tải ${result.filename}`, 'success');
    }
  }
});

// Preview toggle
togglePreview.addEventListener('click', () => {
  previewContent.classList.toggle('hidden');
  togglePreview.querySelector('span') || null;
});

// Convert another
convertAnotherBtn.addEventListener('click', () => {
  uploadedFiles = [];
  convertedResults = [];
  fileList.innerHTML = '';
  filePreview.classList.add('hidden');
  previewContent.classList.add('hidden');
  showSection('uploadSection');
});

// ============ Settings ============
settingsBtn.addEventListener('click', () => {
  apiKeyInput.value = getApiKey();
  modelSelect.value = getModel();
  testResult.classList.add('hidden');
  settingsModal.classList.remove('hidden');
});

closeSettings.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

$('.modal-backdrop')?.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

toggleKeyVisibility.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

testKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast('Vui lòng nhập API key', 'warning');
    return;
  }
  
  testKeyBtn.disabled = true;
  testKeyBtn.innerHTML = '<div class="spinner"></div> Đang kiểm tra...';
  testResult.classList.add('hidden');
  
  const result = await testApiKey(key, modelSelect.value);
  
  testResult.textContent = result.message;
  testResult.className = `test-result ${result.valid ? 'success' : 'error'}`;
  testResult.classList.remove('hidden');
  
  testKeyBtn.disabled = false;
  testKeyBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
    Kiểm tra kết nối
  `;
});

saveSettings.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const model = modelSelect.value;
  
  if (key) {
    setApiKey(key);
    setModel(model);
    settingsModal.classList.add('hidden');
    showToast('Đã lưu cài đặt', 'success');
    // After saving key, show upload section
    onboardingSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadSection.classList.add('active');
  } else {
    showToast('Vui lòng nhập API key', 'warning');
  }
});

// ============ Guide / Onboarding ============
guideBtn.addEventListener('click', () => {
  showSection('onboardingSection');
});

openSettingsFromGuide.addEventListener('click', () => {
  apiKeyInput.value = getApiKey();
  modelSelect.value = getModel();
  testResult.classList.add('hidden');
  settingsModal.classList.remove('hidden');
});

// ============ Init ============
function init() {
  // Show onboarding if no API key
  if (!hasApiKey()) {
    showSection('onboardingSection');
  }
  
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // SW registration failed, app still works without it
    });
  }
}

init();
