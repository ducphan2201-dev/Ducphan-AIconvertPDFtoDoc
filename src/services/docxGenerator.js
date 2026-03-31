// DOCX Generator – Creates Word documents from markdown text
// Uses docx library from CDN

let DocxModule = null;

async function loadDocx() {
  if (DocxModule) return DocxModule;
  DocxModule = await import('https://cdn.jsdelivr.net/npm/docx@9.5.0/+esm');
  return DocxModule;
}

/**
 * Parse markdown text into structured elements
 */
function parseMarkdown(text) {
  // Loại bỏ các thẻ khoảng trắng rác ảo &nbsp; nếu AI nhồi vào
  let cleanText = text.replace(/&nbsp;/ig, ' ');
  
  // Giải mã HTML entities phổ biến mà AI hay nhả ra
  cleanText = cleanText.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  
  // KHÔNG dịch Markdown ** ở đây nữa! Sẽ dịch riêng từng dòng NGOÀI bảng HTML
  // để tránh regex phá nát cấu trúc <table>...</table>

  const lines = cleanText.split('\n');
  const elements = [];
  let inTable = false;
  let tableRows = [];
  let tableAlignments = [];
  let inHtmlTable = false;
  let htmlTableLines = [];
  let inCodeBlock = false;
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    
    // Tách mã canh lề và khoảng trắng trước khi cắt râu ria
    let alignment = null;
    let lineText = rawLine;

    if (lineText.match(/<center>|<div align="center">/i)) {
      alignment = 'center';
      lineText = lineText.replace(/<\/?center>/gi, '').replace(/<div align="center">/gi, '').replace(/<\/div>/gi, '');
    } else if (lineText.match(/<div align="right">|<p align="right">/i)) {
      alignment = 'right';
      lineText = lineText.replace(/<div align="right">/gi, '').replace(/<p align="right">/gi, '').replace(/<\/div>/gi, '').replace(/<\/p>/gi, '');
    } else if (lineText.match(/<div align="justify">|<p align="justify">/i)) {
      alignment = 'justify';
      lineText = lineText.replace(/<div align="justify">/gi, '').replace(/<p align="justify">/gi, '').replace(/<\/div>/gi, '').replace(/<\/p>/gi, '');
    }
    
    // Đếm thụt lề bằng số khoảng trắng ở đầu câu
    let leftIndent = 0;
    const spaceMatch = lineText.match(/^(\s+)/);
    if (spaceMatch) {
      leftIndent = spaceMatch[1].length * 150; // Mỗi dấy cách tương đương ~150 twips Word
    }
    
    let line = lineText.trim(); // line sạch tinh sau khi lọc HTML và khoảng trắng
    
    // Dịch Markdown inline sang HTML CHỈ cho dòng NGOÀI bảng HTML
    if (!inHtmlTable) {
      line = line.replace(/\*\*((?:(?!\n\n).){1,500}?)\*\*/g, '<b>$1</b>');
      line = line.replace(/\*((?:(?!\n\n).){1,500}?)\*/g, '<i>$1</i>');
      line = line.replace(/`((?:(?!\n\n).){1,500}?)`/g, '<code>$1</code>');
    }

    // Code block
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push({ type: 'code', content: codeLines.join('\n') });
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine); // Giữ nguyên khoảng trắng trong code
      continue;
    }

    // HTML Table buffering
    if (inHtmlTable) {
      htmlTableLines.push(rawLine);
      if (line.match(/<\/table>/i)) {
        elements.push({ type: 'htmlTable', content: htmlTableLines.join('\n') });
        inHtmlTable = false;
        htmlTableLines = [];
      }
      continue;
    }
    if (line.match(/<table/i)) {
      inHtmlTable = true;
      htmlTableLines = [rawLine];
      if (line.match(/<\/table>/i)) { // Single line fallback
        elements.push({ type: 'htmlTable', content: htmlTableLines.join('\n') });
        inHtmlTable = false;
        htmlTableLines = [];
      }
      continue;
    }

    // Table
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.replace(/[|\-\s:]/g, '').length === 0) {
        // Separator row (e.g. |:---|:---:|---:|)
        const cols = line.split('|').filter(c => c.trim() !== '');
        const aligns = cols.map(c => {
          const s = c.trim();
          if (s.startsWith(':') && s.endsWith(':')) return 'center';
          if (s.endsWith(':')) return 'right';
          return 'left';
        });
        if (inTable && tableRows.length === 1) { // Apply to the current table
          tableAlignments = aligns;
        }
        continue;
      }
      
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (!inTable) {
        inTable = true;
        tableRows = [];
        tableAlignments = [];
      }
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      elements.push({ type: 'table', rows: tableRows, alignments: tableAlignments });
      tableRows = [];
      tableAlignments = [];
      inTable = false;
    }

    // Page break
    if (line === '---') {
      elements.push({ type: 'pageBreak' });
      continue;
    }

    // Empty line
    if (line === '') {
      elements.push({ type: 'empty' });
      continue;
    }

    // Image Crop Tag [IMG: ymin, xmin, ymax, xmax]
    const imgMatch = line.match(/^\[IMG:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]$/i);
    if (imgMatch) {
      elements.push({
         type: 'imageCrop',
         ymin: parseInt(imgMatch[1], 10),
         xmin: parseInt(imgMatch[2], 10),
         ymax: parseInt(imgMatch[3], 10),
         xmax: parseInt(imgMatch[4], 10)
      });
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      elements.push({ 
        type: 'heading', 
        level: headingMatch[1].length,
        content: headingMatch[2],
        alignment, leftIndent
      });
      continue;
    }

    // Bullet list
    if (line.match(/^[-*+]\s+/)) {
      const content = line.replace(/^[-*+]\s+/, '');
      const level = spaceMatch ? Math.floor(spaceMatch[1].length / 2) : 0;
      elements.push({ type: 'bullet', content, indent: level, alignment, leftIndent });
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s+/)) {
      const content = line.replace(/^\d+\.\s+/, '');
      elements.push({ type: 'numbered', content, alignment, leftIndent });
      continue;
    }

    // Regular paragraph
    elements.push({ type: 'paragraph', content: line, alignment, leftIndent });
  }

  // Đóng block dư
  if (inTable && tableRows.length > 0) {
    elements.push({ type: 'table', rows: tableRows, alignments: tableAlignments });
  }
  if (inHtmlTable && htmlTableLines.length > 0) {
    elements.push({ type: 'htmlTable', content: htmlTableLines.join('\n') });
  }

  return elements;
}

/**
 * Parse inline formatting safely using DOMParser to support infinite tag nesting
 */
function parseInline(text, docx, state = null) {
  const rs = state || { isBold: false, isItalic: false, isUnderline: false, isCode: false, isDeleted: false };
  const runs = [];
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  
  function traverse(node, currentState) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent) return;
      const content = node.textContent; // Do không cần parse bằng tay nữa nên giữ nguyên textContent
      if (content.length === 0) return;
      
      const runOptions = {
        text: content,
        bold: currentState.isBold,
        italics: currentState.isItalic,
        font: {
          ascii: currentState.isCode ? 'Consolas' : 'Times New Roman',
          hAnsi: currentState.isCode ? 'Consolas' : 'Times New Roman',
          eastAsia: 'Microsoft YaHei', // Hỗ trợ Tiếng Trung
          cs: 'Times New Roman'
        },
        size: currentState.isCode ? 20 : 22, // 11pt
      };
      
      if (currentState.isUnderline) {
        runOptions.underline = { type: docx.UnderlineType.SINGLE };
      }
      if (currentState.isCode) {
        runOptions.shading = { fill: 'E5E7EB' };
      }
      if (currentState.isDeleted) {
        runOptions.color = 'FF0000';
        runOptions.strike = true;
      }
      
      runs.push(new docx.TextRun(runOptions));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const nextState = { ...currentState };
      
      if (tagName === 'b' || tagName === 'strong') nextState.isBold = true;
      else if (tagName === 'i' || tagName === 'em') nextState.isItalic = true;
      else if (tagName === 'u') nextState.isUnderline = true;
      else if (tagName === 'code') nextState.isCode = true;
      else if (tagName === 'del' || tagName === 'strike') nextState.isDeleted = true;
      
      node.childNodes.forEach(child => traverse(child, nextState));
    }
  }
  
  doc.body.childNodes.forEach(child => traverse(child, rs));
  
  if (runs.length === 0) {
    runs.push(new docx.TextRun({ text: '', font: { ascii: 'Times New Roman', eastAsia: 'Microsoft YaHei' }, size: 22 }));
  }
  return runs;
}

/**
 * Generate DOCX from extracted text (array of page texts)
 * @param {string[]} pageTexts - array of markdown text per page
 * @param {string} filename - original filename
 * @returns {Promise<Blob>}
 */
export async function generateDocx(pageTexts, filename, sourcePages = []) {
  const docx = await loadDocx();
  
  // Chuẩn hoá thẻ IMG ra một dòng độc lập để regex bắt chuẩn
  const safeJoinText = pageTexts.join('\n\n---\n\n');
  const allText = safeJoinText.replace(/\[IMG:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/gi, '\n[IMG:$1,$2,$3,$4]\n');
  
  const elements = parseMarkdown(allText);
  let currentPageIndex = 0;
  
  const children = [];
  const formatState = { isBold: false, isItalic: false, isUnderline: false, isCode: false };
  
  function applyFormatting(options, el, docx) {
    if (el.alignment === 'center') options.alignment = docx.AlignmentType.CENTER;
    else if (el.alignment === 'right') options.alignment = docx.AlignmentType.RIGHT;
    else if (el.alignment === 'justify') options.alignment = docx.AlignmentType.JUSTIFIED;
    
    if (el.leftIndent > 0) {
      if (!options.indent) options.indent = {};
      options.indent.left = el.leftIndent;
    }
    return options;
  }
  
  const headingLevels = {
    1: docx.HeadingLevel.HEADING_1,
    2: docx.HeadingLevel.HEADING_2,
    3: docx.HeadingLevel.HEADING_3,
    4: docx.HeadingLevel.HEADING_4,
    5: docx.HeadingLevel.HEADING_5,
    6: docx.HeadingLevel.HEADING_6,
  };

  for (const el of elements) {
    switch (el.type) {
      case 'heading':
        children.push(new docx.Paragraph(applyFormatting({
          children: parseInline(el.content, docx, formatState),
          heading: headingLevels[el.level] || docx.HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }, el, docx)));
        break;

      case 'paragraph':
        children.push(new docx.Paragraph(applyFormatting({
          children: parseInline(el.content, docx, formatState),
          spacing: { after: 120 },
        }, el, docx)));
        break;

      case 'bullet':
        children.push(new docx.Paragraph(applyFormatting({
          children: parseInline(el.content, docx, formatState),
          bullet: { level: el.indent || 0 },
          spacing: { after: 60 },
        }, el, docx)));
        break;

      case 'numbered':
        children.push(new docx.Paragraph(applyFormatting({
          children: parseInline(el.content, docx, formatState),
          numbering: { reference: 'default-numbering', level: 0 },
          spacing: { after: 60 },
        }, el, docx)));
        break;

      case 'table': {
        if (el.rows.length > 0) {
          const tableRows = el.rows.map((row, rowIdx) => 
            new docx.TableRow({
              children: row.map((cell, colIdx) => {
                // Tách ô chứa thẻ <br> thành các đoạn văn xếp chồng bên trong cùng 1 ô
                const cellLines = cell.split(/<br\s*\/?>/i);
                return new docx.TableCell({
                  children: cellLines.map(line => {
                    let alignment = null;
                    if (el.alignments && el.alignments[colIdx]) {
                      if (el.alignments[colIdx] === 'center') alignment = docx.AlignmentType.CENTER;
                      if (el.alignments[colIdx] === 'right') alignment = docx.AlignmentType.RIGHT;
                    }
                    let cleanLine = line;

                    // Nhận diện Code căn lề trong từng dòng của Từng Ô Bảng
                    if (cleanLine.match(/<center>|<div align="center">/i)) {
                      alignment = docx.AlignmentType.CENTER;
                      cleanLine = cleanLine.replace(/<\/?center>/gi, '').replace(/<div align="center">/gi, '').replace(/<\/div>/gi, '');
                    } else if (cleanLine.match(/<div align="right">|<p align="right">/i)) {
                      alignment = docx.AlignmentType.RIGHT;
                      cleanLine = cleanLine.replace(/<div align="right">/gi, '').replace(/<p align="right">/gi, '').replace(/<\/div>/gi, '').replace(/<\/p>/gi, '');
                    } else if (cleanLine.match(/<div align="justify">|<p align="justify">/i)) {
                      alignment = docx.AlignmentType.JUSTIFIED;
                      cleanLine = cleanLine.replace(/<div align="justify">/gi, '').replace(/<p align="justify">/gi, '').replace(/<\/div>/gi, '').replace(/<\/p>/gi, '');
                    }

                    const paragraphOptions = {
                      children: parseInline(cleanLine, docx),
                      spacing: { after: 60 }
                    };
                    if (alignment) paragraphOptions.alignment = alignment;

                    return new docx.Paragraph(paragraphOptions);
                  }),
                  margins: { top: 40, bottom: 40, left: 80, right: 80 },
                  borders: {
                    top: { style: 'single', size: 1, color: '000000' },
                    bottom: { style: 'single', size: 1, color: '000000' },
                    left: { style: 'single', size: 1, color: '000000' },
                    right: { style: 'single', size: 1, color: '000000' },
                  },
                });
              }),
            })
          );
          
          children.push(new docx.Table({
            rows: tableRows,
            layout: docx.TableLayoutType.AUTOFIT
          }));
          
          children.push(new docx.Paragraph({ text: '', spacing: { after: 120 } }));
        }
        break;
      }

      case 'htmlTable': {
        const parser = new DOMParser();
        const doc = parser.parseFromString(el.content, 'text/html');
        const tableNode = doc.querySelector('table');
        if (!tableNode) break;

        const htmlRows = Array.from(tableNode.querySelectorAll('tr'));
        const docxRows = htmlRows.map((tr, rowIdx) => {
          const isHeaderRow = tr.querySelector('th') !== null || rowIdx === 0;
          const htmlCells = Array.from(tr.querySelectorAll('td, th'));
          
          const docxCells = htmlCells.map(td => {
            const colSpan = parseInt(td.getAttribute('colspan') || '1', 10);
            const rowSpan = parseInt(td.getAttribute('rowspan') || '1', 10);
            
            // Lấy alignment từ thuộc tính align hoặc tag <center> bọc ngoài cùng
            let cellAlignment = null;
            const alignAttr = td.getAttribute('align') || (td.style && td.style.textAlign);
            if (alignAttr === 'center') cellAlignment = docx.AlignmentType.CENTER;
            else if (alignAttr === 'right') cellAlignment = docx.AlignmentType.RIGHT;
            else if (alignAttr === 'justify') cellAlignment = docx.AlignmentType.JUSTIFIED;

            // Giải mã HTML entities còn sót trong innerHTML
            let cellHtml = td.innerHTML.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
            const cellTextBlocks = cellHtml.split(/<br\s*\/?>/i).map(s => s.trim());
            
            const cellParagraphs = cellTextBlocks.map(line => {
              let cleanLine = line;
              let lineAlignment = cellAlignment;
              
              if (cleanLine.match(/<center>|<div align="center">/i)) {
                lineAlignment = docx.AlignmentType.CENTER;
                cleanLine = cleanLine.replace(/<\/?center>/gi, '').replace(/<div align="center">/gi, '').replace(/<\/div>/gi, '');
              } else if (cleanLine.match(/<div align="right">|<p align="right">/i)) {
                lineAlignment = docx.AlignmentType.RIGHT;
                cleanLine = cleanLine.replace(/<div align="right">/gi, '').replace(/<p align="right">/gi, '').replace(/<\/div>/gi, '').replace(/<\/p>/gi, '');
              }

              // Làm sạch HTML tags dư dả từ DOM extract (giữ lại b, i, u, code)
              cleanLine = cleanLine.replace(/<(?!\/?(?:b|i|u|code)>)[^>]+>/g, '');
              
              const pOptions = {
                children: parseInline(cleanLine, docx),
                spacing: { after: 60 } // Khoảng cách dòng mảnh
              };
              if (lineAlignment) pOptions.alignment = lineAlignment;
              return new docx.Paragraph(pOptions);
            });
            
            const cellOptions = {
              children: cellParagraphs.length > 0 ? cellParagraphs : [new docx.Paragraph("")],
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              borders: {
                top: { style: 'single', size: 1, color: '000000' },
                bottom: { style: 'single', size: 1, color: '000000' },
                left: { style: 'single', size: 1, color: '000000' },
                right: { style: 'single', size: 1, color: '000000' },
              }
            };
            
            if (colSpan > 1) cellOptions.columnSpan = colSpan;
            if (rowSpan > 1) cellOptions.rowSpan = rowSpan;
            
            return new docx.TableCell(cellOptions);
          });
          
          return new docx.TableRow({ children: docxCells });
        });
        
        children.push(new docx.Table({
           rows: docxRows,
           layout: docx.TableLayoutType.AUTOFIT
        }));
        children.push(new docx.Paragraph({ text: '', spacing: { after: 120 } }));
        break;
      }

      case 'code':
        children.push(new docx.Paragraph({
          children: [new docx.TextRun({ 
            text: el.content, 
            font: {
              ascii: 'Consolas',
              hAnsi: 'Consolas',
              eastAsia: 'Microsoft YaHei'
            },
            size: 18,
          })],
          shading: { fill: 'F3F4F6' },
          spacing: { before: 120, after: 120 },
        }));
        break;

      case 'empty':
        children.push(new docx.Paragraph({
          text: '',
          spacing: { after: 120 },
        }));
        break;

      case 'pageBreak':
        children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
        currentPageIndex++;
        break;
        
      case 'imageCrop': {
        const sourcePage = sourcePages[currentPageIndex];
        if (!sourcePage) break;
        
        try {
          const img = new Image();
          img.src = sourcePage.image;
          await new Promise((resolve, reject) => {
             img.onload = resolve;
             img.onerror = reject;
          });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          const sx = (el.xmin / 1000) * img.width;
          const sy = (el.ymin / 1000) * img.height;
          const sWidth = ((el.xmax - el.xmin) / 1000) * img.width;
          const sHeight = ((el.ymax - el.ymin) / 1000) * img.height;
          
          if (sWidth <= 0 || sHeight <= 0) break;

          canvas.width = sWidth;
          canvas.height = sHeight;
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
          
          const croppedDataUrl = canvas.toDataURL('image/png');
          const base64Data = croppedDataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");
          const binaryString = window.atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }

          const MAX_WIDTH = 550;
          let finalWidth = sWidth;
          let finalHeight = sHeight;
          if (finalWidth > MAX_WIDTH) {
             const ratio = MAX_WIDTH / finalWidth;
             finalWidth = MAX_WIDTH;
             finalHeight = sHeight * ratio;
          }

          children.push(new docx.Paragraph({
             children: [
                new docx.ImageRun({
                   data: bytes.buffer,
                   transformation: { width: finalWidth, height: finalHeight }
                })
             ],
             alignment: docx.AlignmentType.CENTER,
             spacing: { before: 240, after: 240 }
          }));
        } catch(e) {
          console.error("Image Crop Error:", e);
        }
        break;
      }
    }
  }

  const doc = new docx.Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: docx.LevelFormat.DECIMAL,
          text: '%1.',
          alignment: docx.AlignmentType.START,
        }],
      }],
    },
    sections: [{
      children,
      properties: {
        page: {
          margin: {
            top: 1440,     // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
    }],
  });

  return await docx.Packer.toBlob(doc);
}
