// Gemini Service – Direct API calls to Google Gemini Pro Vision
import { getApiKey, getModel } from '../utils/storage.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Bạn là chuyên gia OCR và phân tích tài liệu. Nhiệm vụ của bạn là trích xuất TOÀN BỘ nội dung từ hình ảnh các trang tài liệu theo đúng thứ tự.

QUY TẮC:
1. Trích xuất CHÍNH XÁC 100% nội dung. BẠN PHẢI DỊCH ĐẦY ĐỦ TẤT CẢ CÁC TRANG ẢNH ĐƯỢC GỬI ĐẾN, KHÔNG ĐƯỢC TÓM TẮT, KHÔNG ĐƯỢC BỎ SÓT !
2. BẢO TOÀN ĐỊNH DẠNG (ĐIỀU BẮT BUỘC):
   - Chữ CANH GIỮA (Quốc hiệu, Tiêu đề): Bọc trong tag <center>chữ</center>.
   - Chữ CANH PHẢI (Ngày tháng, Chữ ký): Bọc trong tag <div align="right">chữ</div>.
   - Đoạn văn CANH ĐỀU 2 BÊN (Hợp đồng): Bọc trong tag <div align="justify">chữ</div>.
   - Chữ GẠCH CHÂN: Bọc trong tag <u>chữ</u>.
   - Chữ IN ĐẬM/IN NGHIÊNG: Dùng tag <b>chữ</b> và <i>chữ</i>.
   - QUAN TRỌNG: ĐỂ THỤT LỀ, CHỈ DÙNG DẤU CÁCH (SPACE). NGHIÊM CẤM DÙNG MÃ HTML NHƯ "&nbsp;" HAY "&#160;". Nếu vi phạm toàn bộ file sẽ bị hỏng!
3. KỸ THUẬT XỬ LÝ BẢNG BIỂU (NHÌN KỸ BẢN GỐC):
   - BẮT BUỘC PHẢI DÙNG MÃ HTML "<table>", "<tr>", "<th>", "<td>" CHO TẤT CẢ CÁC BẢNG BIỂU (Dù là đơn giản hay phức tạp).
   - TUYỆT ĐỐI KHÔNG ĐƯỢC DÙNG MARKDOWN LÀM BẢNG (Không dùng |||).
   - Đối với các bảng có Ô BỊ GỘP (Merged Cells), PHẢI SỬ DỤNG mượt mà thuộc tính colspan="N" và rowspan="N" để dựng lại KHUNG MA TRẬN đúng đúc bản gốc!
   - BÊN TRONG CÁC Ô HTML: Nếu 1 ô có nhiều dòng, dùng thẻ "<br>" để xuống dòng. ĐỐI VỚI NỘI DUNG CĂN LỀ, bọc thẻ "<center>chữ</center>" hoặc "<div align='right'>chữ</div>" trực tiếp vào trong Ô đó.
   - BÊN NGOÀI BẢNG: NGHIÊM CẤM thẻ "<br>", bấm phím Enter thật để tạo dòng trống.
4. BẢO TOÀN KÝ HIỆU TICK: Giữ nguyên vẹn và mô phỏng chính xác các loại hộp kiểm góc cạnh từ file scan (Ví dụ: ☑, ☐, ✔, ☒, ◦, •). Không được tự ý đổi thành chữ O hay X.
5. Bỏ qua các thông tin vô nghĩa mép giấy.
6. HÃY DÙNG CHÍNH XÁC KÝ HIỆU \`---\` GIỮA TRANG ĐỂ NGẮT TRANG Y HỆT FILE TRONG PDF! CHIA ĐÚNG SỐ TRANG CỦA HÌNH ẢNH GỐC.
7. ĐO ĐẠC HÌNH ẢNH (SPATIAL CROP): Nếu tài liệu có chứa Sơ đồ, Bản vẽ, Hình ảnh minh hoạ, Con dấu hoặc Chữ Ký dán tay... AI BẮT BUỘC ĐO LƯỜNG TOẠ ĐỘ của bức ảnh đó và ghi chú theo đúng cú pháp sau: \`[IMG: ymin, xmin, ymax, xmax]\`
   - Toạ độ (ymin, xmin, ymax, xmax) được chiếu theo tỷ lệ phần ngàn (0-1000) quét trên diện tích của trang giấy chứa bức ảnh đó (0,0 là góc trên bên trái, 1000,1000 là góc dưới bên phải).
   - Hãy chèn đoạn \`[IMG: ymin, xmin, ymax, xmax]\` vào CHÍNH XÁC vị trí mà bức ảnh đó xuất hiện so với các đoạn chữ xung quanh! KHÔNG ĐƯỢC CHÈN SAI VỊ TRÍ, KHÔNG ĐƯỢC BỎ QUA ẢNH!
   - KHI XUNG ĐỘT VỚI BẢNG: Nếu CÓ Hình ảnh (Con dấu, chữ ký, logo...) ĐÈ LÊN HOẶC DÍNH SÁT vào Bảng Biểu, BẠN PHẢI ƯU TIÊN VẼ LẠI BẢNG BIỂU ĐÓ và BỎ QUA HOÀN TOÀN TÁC TRÍCH XUẤT HÌNH ẢNH ĐÓ (Không ghi thẻ IMG cho khu vực đó) để bảo đảm cấu trúc bảng không bị phá vỡ.

OUTPUT: Trả về nội dung dạng văn bản có kèm HTML. BẢNG BIỂU BẮT BUỘC DÙNG HTML <table>. Nội dung ngoài bảng dùng text thuần tuý kèm các thẻ định dạng <b>, <i>, <u>, <center>, <div align="..."> như hướng dẫn ở trên.`;

export async function extractTextFromImages(base64Images, signal = null) {
  const apiKey = getApiKey();
  const model = getModel();

  if (!apiKey) throw new Error('API key chưa được cài đặt');

  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
  const parts = [{ text: SYSTEM_PROMPT }];

  for (const img of base64Images) {
    const imageData = img.replace(/^data:image\/\w+;base64,/, '');
    parts.push({
      inlineData: { mimeType: 'image/jpeg', data: imageData }
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error?.message || `API error: ${response.status}`;
    if (response.status === 429) {
      throw new Error(`Khoá API: ${message}`);
    }
    if (response.status === 403) {
      throw new Error('API key không hợp lệ hoặc chưa kích hoạt.');
    }
    throw new Error(message);
  }

  const data = await response.json();
  const candidates = data.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini không trả về kết quả cấu trúc mong muốn.');
  }

  return (candidates[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function processPages(pages, onProgress = () => { }, signal = null) {
  const results = [];
  let completed = 0;
  const CHUNK_SIZE = 3;

  let i = 0;
  while (i < pages.length) {
    if (signal?.aborted) throw new Error('Đã hủy');

    const page = pages[i];

    // Nếu là trang text
    if (page.hasText && page.text.length > 50) {
      results.push(page.text + '\n\n');
      completed++;
      onProgress(completed, pages.length, `Trang ${i + 1}: Trích xuất text trực tiếp`);
      i++;
      continue;
    }

    // Nếu là trang hình ảnh, gom mẻ CHUNK_SIZE trang để dùng vision
    const chunk = [];
    let j = i;
    while (j < pages.length && chunk.length < CHUNK_SIZE) {
      if (pages[j].hasText && pages[j].text.length > 50) break;
      chunk.push(pages[j].image);
      j++;
    }

    onProgress(completed, pages.length, `Trang ${i + 1}-${j}: Đang dùng AI phân tích gộp (Cực nhanh)...`);

    try {
      if (i > 0) {
        // Chờ 5 giây trước khi gọi mẻ tiếp theo tránh 15 RPM rate limit
        await new Promise(r => setTimeout(r, 10000));
      }

      const chunkText = await extractTextFromImages(chunk, signal);
      results.push(chunkText);

      completed += chunk.length;
      onProgress(completed, pages.length, `Đã hoàn thành đến trang ${j}`);
      i = j;
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Đã hủy') throw err;

      if (err.message.startsWith('RATE_LIMIT:')) {
        const waitSeconds = parseInt(err.message.split(':')[1], 10);
        for (let s = waitSeconds; s > 0; s--) {
          if (signal?.aborted) throw new Error('Đã hủy');
          onProgress(completed, pages.length, `Mẻ trang ${i + 1}-${j}: Google giới hạn API. Đang chờ đếm ngược: ${s} giây...`);
          await new Promise(r => setTimeout(r, 1000));
        }
        continue; // Không tăng i, vòng lặp tự động gửi lại đúng mẻ trang này!
      }

      results.push(`[Lỗi OCR mẻ trang ${i + 1}-${j}: ${err.message}]`);
      completed += chunk.length;
      onProgress(completed, pages.length, `Đã bỏ qua lỗi đến trang ${j}`);
      i = j;
    }
  }

  const flatResultText = results.join('\n---\n');
  const pagesArray = flatResultText.split(/\n---\n/g).filter(text => text.trim().length > 0);
  return pagesArray;
}

export async function testApiKey(apiKey, model = 'gemini-3-flash-preview') {
  try {
    const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with only: OK' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    if (response.ok) {
      return { valid: true, message: '✅ Kết nối thành công! API key hợp lệ.' };
    }

    const error = await response.json().catch(() => ({}));
    return { valid: false, message: `❌ ${error?.error?.message || 'API key không hợp lệ'}` };
  } catch (err) {
    return { valid: false, message: `❌ Lỗi kết nối: ${err.message}` };
  }
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status === 503) {
        const errorData = await response.clone().json().catch(() => ({}));
        const message = errorData?.error?.message || '';
        
        // Mặc định chờ 15 giây cho lỗi 503
        let waitTime = 15; 
        if (response.status === 429) {
          const match = message.match(/retry in (\d+\.\d+)s/);
          waitTime = match ? Math.ceil(parseFloat(match[1]) + 2) : 60;
        }
        
        throw new Error(`RATE_LIMIT:${waitTime}`);
      }
      return response;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (err.message && err.message.startsWith('RATE_LIMIT:')) throw err;

      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
