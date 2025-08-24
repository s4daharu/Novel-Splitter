// @ts-nocheck
// This app uses a global JSZip variable from a CDN script in index.html
declare var JSZip: any;

// DOM refs
const fileInput = document.getElementById('fileInput');
const coverInput = document.getElementById('coverInput');
const chapterPatternSelect = document.getElementById('chapterPattern');
const customRegexContainer = document.getElementById('customRegexContainer');
const customRegexInput = document.getElementById('customRegexInput');
const encodingSelect = document.getElementById('encodingSelect');
const fileNameInfo = document.getElementById('fileNameInfo');
const coverNameInfo = document.getElementById('coverNameInfo');
const processZipBtn = document.getElementById('processZipBtn');
const processEpubBtn = document.getElementById('processEpubBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const statusDiv = document.getElementById('status');
const matchPreview = document.getElementById('matchPreview');
const metaTitle = document.getElementById('metaTitle');
const metaAuthor = document.getElementById('metaAuthor');

// State
let fileContent = '';
let fileName = '';
let coverFile = null;

// Helpers
function setStatus(msg, type){
  statusDiv.textContent = msg;
  statusDiv.className = 'status small'; // Reset classes
  if(type) statusDiv.classList.add(type);
}
function showProgress(){ progressContainer.style.display = 'block'; updateProgress(0,''); }
function hideProgress(){ progressContainer.style.display = 'none'; }
function updateProgress(pct, msg){
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  progressBar.style.width = v + '%';
  progressText.textContent = v + '%' + (msg ? (' – ' + msg) : '');
}
function safeFilename(name){
  return String(name || '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 180) || 'untitled';
}
async function decodeText(buffer, encoding) {
  if (encoding === 'auto') {
    // Try UTF-8 first. It's the most common. `fatal: true` throws on invalid byte sequences.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }

    // Try GBK, common for simplified Chinese.
    try { return new TextDecoder('gbk', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }

    // Try Big5, common for traditional Chinese.
    try { return new TextDecoder('big5', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }
    
    // If all fail, use a non-fatal UTF-8 decode as a last resort.
    setStatus('Auto-detection failed; file might be in an unsupported encoding. Displaying with UTF-8.', 'error');
    return new TextDecoder('utf-8').decode(buffer);
  } else {
    // User specified an encoding, use it. Non-fatal decode will replace errors with �.
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  }
}
function readFileAsArrayBuffer(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}
function downloadFile(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function uuidv4(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function escapeHtml(s){
  const d = document.createElement('div');
  d.innerText = s;
  return d.innerHTML;
}
function getCoverExtension(mime){
  const map = {'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'};
  return map[mime] || 'img';
}

// Chapter detection templates
const CHAPTER_TEMPLATES = {
  chinese: /^\s*第\s*([0-9]+)\s*章[\.。:\s]?.*$/im,
  chinese_numeral: /^\s*第\s*([一二三四五六七八九十百千零〇]+)\s*章.*$/im,
  chapter: /^\s*Chapter\s*([0-9]+)\b.*$/im,
  ch: /^\s*Ch(?:apter)?\.?\s*([0-9]+)\b.*$/im,
  titledot: /^\s*([^\r\n]{1,120})\.\s*\d+\s*$/uim,
  parenfullwidth: /^\s*（\s*\d+\s*\.?\s*）\s*$/uim
};

function detectPattern(lines) {
  for(const key in CHAPTER_TEMPLATES){
    const rx = CHAPTER_TEMPLATES[key];
    let c = 0;
    for(let i=0;i<Math.min(lines.length, 400); i++){
      if(rx.test(lines[i])){ c++; if(c>1) return {key, rx}; }
    }
  }
  return null;
}

function getActiveRegexInfo() {
    const selected = chapterPatternSelect.value;
    if (selected === 'custom') {
        const pattern = customRegexInput.value;
        if (!pattern) return { rx: null, key: 'custom', error: 'Please enter a custom Regex pattern.' };
        try {
            return { rx: new RegExp(pattern, 'im'), key: 'custom' };
        } catch (e) {
            return { rx: null, key: 'custom', error: `Invalid Regex: ${e.message}` };
        }
    }
    if (selected === 'auto') {
        const lines = (fileContent || '').split(/\r?\n/);
        const detected = detectPattern(lines);
        if (detected) return detected;
        return { rx: null, key: 'auto', error: 'Auto-detect found no repeated heading pattern in first 400 lines.' };
    }
    return { rx: CHAPTER_TEMPLATES[selected] || null, key: selected };
}

function getExampleMatches(rx, lines) {
  const arr = [];
  for(let i=0;i<Math.min(lines.length, 500); i++){
    if(rx.test(lines[i])) arr.push(lines[i].trim());
    if(arr.length>=5) break;
  }
  return arr;
}

function showMatchPreview() {
  if(!fileContent) { matchPreview.style.display = 'none'; return; }
  const lines = fileContent.split(/\r?\n/);
  const info = getActiveRegexInfo();

  matchPreview.style.display = 'block';

  if(info.error){
    matchPreview.textContent = info.error;
    return;
  }
  if(!info.rx){
    matchPreview.textContent = 'No pattern selected or detected.';
    return;
  }

  const matches = getExampleMatches(info.rx, lines);
  if (matches.length) {
    let prefix = '';
    if (info.key === 'auto' && info.rx) {
        const detectedKey = Object.keys(CHAPTER_TEMPLATES).find(k => CHAPTER_TEMPLATES[k] === info.rx);
        prefix = `Auto-detected: ${detectedKey}. `;
    }
    matchPreview.textContent = `${prefix}Matches: ${matches.join(' | ')}`;
  } else {
    matchPreview.textContent = 'No matches found for this pattern in the first 500 lines.';
  }
}

function splitChapters(text) {
  const lines = String(text).split(/\r?\n/);
  const info = getActiveRegexInfo();
  
  if (info.error) {
    setStatus(info.error, 'error');
    return null;
  }

  const rx = info.rx;
  const chapters = [];
  let current = null;
  const pushCurrent = () => { if(current) chapters.push(current); };

  if(!rx){
    chapters.push({ title: 'synopsis', content: text.trim() });
    return chapters;
  }

  let preface = [];
  for(const raw of lines){
    const line = String(raw || '');
    if(rx.test(line)){
      pushCurrent();
      current = { title: line.trim(), content: '' };
    } else {
      if(!current) preface.push(line);
      else current.content += line + '\n';
    }
  }
  pushCurrent();
  chapters.unshift({ title: 'synopsis', content: preface.join('\n').trim() });
  return chapters;
}

function buildXhtml(title, bodyText){
  const paras = String(bodyText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const body = paras.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh" lang="zh">\n<head>\n  <meta charset="utf-8" />\n  <title>${escapeHtml(title || '')}</title>\n</head>\n<body>\n  <h2>${escapeHtml(title || '')}</h2>\n  ${body}\n</body>\n</html>`;
}

async function createZipDownload(chapters){
  showProgress();
  updateProgress(5, 'Preparing ZIP…');
  const zip = new JSZip();
  const base = safeFilename((fileName || 'novel').replace(/\.txt$/i, ''));
  const total = chapters.length;
  for(let i=0;i<total;i++){
    const ch = chapters[i];
    const namePart = (i === 0) ? 'synopsis' : (ch.title || `chapter${i}`);
    const index = String(i).padStart(3, '0');
    const fname = `${index}_${safeFilename(namePart)}.txt`;
    zip.file(fname, ch.content || '');
    updateProgress(10 + (i/total)*80, `Adding ${fname}`);
    await new Promise(r => setTimeout(r, 0));
  }
  updateProgress(95, 'Generating ZIP…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const outName = `${base}_chapters.zip`;
  downloadFile(blob, outName);
  updateProgress(100, 'Done');
  hideProgress();
  setStatus(`Downloaded ${outName}`, 'success');
}

async function createEpubDownload(chapters){
  showProgress();
  updateProgress(5, 'Preparing EPUB…');
  const zip = new JSZip();
  const base = safeFilename((fileName || 'novel').replace(/\.txt$/i, ''));
  const bookId = uuidv4();
  const titleMeta = metaTitle.value.trim() || base;
  const authorMeta = metaAuthor.value.trim() || 'Unknown';
  const lang = 'zh';

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
    `  <rootfiles>\n` +
    `    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n` +
    `  </rootfiles>\n` +
    `</container>`
  );

  const oebps = zip.folder('OEBPS');
  let coverHref = null;
  if(coverFile){
    const ext = getCoverExtension(coverFile.type);
    const ab = await readFileAsArrayBuffer(coverFile);
    const coverName = `cover.${ext}`;
    oebps.file(coverName, ab);
    coverHref = coverName;
  }

  const xhtmlFiles = [];
  for(let i=0;i<chapters.length;i++){
    const ch = chapters[i];
    const namePart = (i === 0) ? 'synopsis' : (ch.title || `chapter${i}`);
    const index = String(i).padStart(3, '0');
    const fname = `${index}_${safeFilename(namePart)}.xhtml`;
    const xhtml = buildXhtml(ch.title, ch.content);
    oebps.file(fname, xhtml);
    xhtmlFiles.push({ id: `chap${i}`, href: fname, title: ch.title || `Chapter ${i}` });
    updateProgress(10 + (i / chapters.length) * 70, `Adding ${fname}`);
    await new Promise(r => setTimeout(r, 0));
  }

  if(coverHref){
    const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">\n<head><meta charset="utf-8"/><title>Cover</title></head>\n<body style="margin:0;padding:0;text-align:center;">\n  <img src="${coverHref}" alt="Cover" style="max-width:100%;height:auto;"/>\n</body>\n</html>`;
    oebps.file('cover.xhtml', coverXhtml);
  }

  const navMapEntries = xhtmlFiles.map((f, idx) =>
    `<navPoint id="navPoint-${idx+1}" playOrder="${idx+1}">\n  <navLabel><text>${escapeHtml(f.title)}</text></navLabel>\n  <content src="${f.href}"/>\n</navPoint>`
  ).join('\n');
  oebps.file('toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n` +
    `  <head>\n    <meta name="dtb:uid" content="${bookId}"/>\n    <meta name="dtb:depth" content="1"/>\n    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n` +
    `  </head>\n` +
    `  <docTitle><text>${escapeHtml(titleMeta)}</text></docTitle>\n` +
    `  <navMap>\n${navMapEntries}\n  </navMap>\n` +
    `</ncx>`
  );

  const manifestItems = [];
  const spineItems = [];
  manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

  if(coverHref && coverFile){
    manifestItems.push(`<item id="cover-image" href="${coverHref}" media-type="${coverFile.type || 'image/jpeg'}"/>`);
    manifestItems.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="cover" linear="yes"/>`);
  }

  for(const f of xhtmlFiles){
    manifestItems.push(`<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${f.id}" linear="yes"/>`);
  }

  const opf = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">\n` +
    `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">\n` +
    `    <dc:title>${escapeHtml(titleMeta)}</dc:title>\n` +
    `    <dc:creator>${escapeHtml(authorMeta)}</dc:creator>\n` +
    `    <dc:language>${lang}</dc:language>\n` +
    `    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>\n` +
    (coverHref ? `    <meta name="cover" content="cover-image"/>\n` : '') +
    `  </metadata>\n` +
    `  <manifest>\n    ${manifestItems.join('\n    ')}\n  </manifest>\n` +
    `  <spine toc="ncx">\n    ${spineItems.join('\n    ')}\n  </spine>\n` +
    `</package>`;

  oebps.file('content.opf', opf);

  updateProgress(95, 'Packaging EPUB…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const outName = `${base}.epub`;
  downloadFile(blob, outName);
  updateProgress(100, 'Done');
  hideProgress();
  setStatus(`Downloaded ${outName}`, 'success');
}

// Event handlers
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if(!f){ setStatus('No file selected', 'error'); return; }
  if(!(f.type === 'text/plain' || /\.txt$/i.test(f.name))){
    setStatus('Please choose a .txt file.', 'error');
    return;
  }
  try{
    showProgress();
    updateProgress(5, 'Reading file…');
    const buffer = await readFileAsArrayBuffer(f);
    updateProgress(25, 'Decoding text…');
    const selectedEncoding = encodingSelect.value;
    fileContent = await decodeText(buffer, selectedEncoding);

    fileName = f.name || 'novel.txt';
    fileNameInfo.textContent = `Loaded: ${fileName}`;
    setStatus(`Loaded: ${fileName}`, 'success');
    processZipBtn.disabled = false;
    processEpubBtn.disabled = false;
    showMatchPreview();
    updateProgress(100, 'Ready');
    setTimeout(hideProgress, 300);
  }catch(err){
    console.error(err);
    hideProgress();
    setStatus('Failed to read file.', 'error');
  }
});

coverInput.addEventListener('change', (e) => {
  coverFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  if(coverFile){
    if(!String(coverFile.type || '').startsWith('image/')){
      setStatus('Cover must be an image file.', 'error');
      coverFile = null;
      coverNameInfo.textContent = '';
      return;
    }
    coverNameInfo.textContent = `Cover: ${coverFile.name}`;
    setStatus(`Cover loaded: ${coverFile.name}`, 'success');
  } else {
    coverNameInfo.textContent = '';
  }
});

chapterPatternSelect.addEventListener('change', () => {
  customRegexContainer.style.display = chapterPatternSelect.value === 'custom' ? 'block' : 'none';
  showMatchPreview();
});

customRegexInput.addEventListener('input', showMatchPreview);

async function handleProcessing(type) {
  if(!fileContent){ setStatus('Select a .txt file first.', 'error'); return; }
  setStatus(`Processing ${type.toUpperCase()}…`);
  try{
    const chapters = splitChapters(fileContent);
    if (!chapters) return;
    
    if (type === 'zip') {
      await createZipDownload(chapters);
    } else {
      await createEpubDownload(chapters);
    }
  }catch(err){
    console.error(err);
    setStatus(`Error creating ${type.toUpperCase()}.`, 'error');
  }
}

processZipBtn.addEventListener('click', () => handleProcessing('zip'));
processEpubBtn.addEventListener('click', () => handleProcessing('epub'));