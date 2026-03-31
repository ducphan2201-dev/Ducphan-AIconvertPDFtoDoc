// PDF Processor – renders PDF pages to images using PDF.js loaded from CDN

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  // Load PDF.js from CDN
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs';
      script.type = 'module';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    
    // Fallback: use global import
    const module = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');
    window.pdfjsLib = module;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
  }
  
  pdfjsLib = window.pdfjsLib;
  return pdfjsLib;
}

/**
 * Process a PDF file: render pages to images and extract text if available
 * @param {File} file - PDF file
 * @param {Function} onProgress - callback(currentPage, totalPages)
 * @returns {Promise<{pages: Array<{image: string, hasText: boolean, text: string}>, totalPages: number}>}
 */
export async function processPdf(file, onProgress = () => {}) {
  const pdfjs = await loadPdfJs();
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages = [];
  
  for (let i = 1; i <= totalPages; i++) {
    onProgress(i, totalPages);
    const page = await pdf.getPage(i);
    
    // Try to extract text (Chỉ để tham khảo, Luôn tắt để ép dùng OCR bảo toàn Layout)
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str).filter(s => s.trim());
    const hasText = false; // Tắt tính năng tự trích text gốc để tránh làm vỡ Bảng biểu
    const text = ''; 
    
    // Render to canvas at 200 DPI (good balance of quality vs size for API)
    const viewport = page.getViewport({ scale: 2.0 }); // ~200 DPI
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;
    
    // Convert to base64 JPEG (smaller than PNG for API)
    const image = canvas.toDataURL('image/jpeg', 0.85);
    
    pages.push({ image, hasText, text });
    
    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
  }
  
  return { pages, totalPages };
}

/**
 * Get thumbnail of first page
 * @param {File} file 
 * @returns {Promise<string>} base64 image
 */
export async function getThumbnail(file) {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 0.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  const thumb = canvas.toDataURL('image/jpeg', 0.7);
  
  canvas.width = 0;
  canvas.height = 0;
  
  return thumb;
}

/**
 * Get page count of a PDF file
 * @param {File} file
 * @returns {Promise<number>}
 */
export async function getPageCount(file) {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}
