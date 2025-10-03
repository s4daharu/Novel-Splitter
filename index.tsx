
import './index.css';

// This app uses a global JSZip variable from a CDN script in index.html
declare var JSZip: any;

// DOM refs
const setupView = document.getElementById('setupView') as HTMLElement;
const editorView = document.getElementById('editorView') as HTMLElement;

// Setup View
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const coverInput = document.getElementById('coverInput') as HTMLInputElement;
const fileDropZone = document.getElementById('fileDropZone') as HTMLElement;
const coverDropZone = document.getElementById('coverDropZone') as HTMLElement;
const chapterPatternSelect = document.getElementById('chapterPattern') as HTMLSelectElement;
const customRegexContainer = document.getElementById('customRegexContainer') as HTMLElement;
const customRegexInput = document.getElementById('customRegexInput') as HTMLInputElement;
const encodingSelect = document.getElementById('encodingSelect') as HTMLSelectElement;
const fileNameInfo = document.getElementById('fileNameInfo') as HTMLElement;
const coverNameInfo = document.getElementById('coverNameInfo') as HTMLElement;
const processBtn = document.getElementById('processBtn') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLElement;
const matchPreview = document.getElementById('matchPreview') as HTMLElement;
const metaTitle = document.getElementById('metaTitle') as HTMLInputElement;
const metaAuthor = document.getElementById('metaAuthor') as HTMLInputElement;
const epubTheme = document.getElementById('epubTheme') as HTMLSelectElement;
const cleanupRulesContainer = document.getElementById('cleanupRulesContainer') as HTMLElement;
const addRuleBtn = document.getElementById('addRuleBtn') as HTMLButtonElement;

// Editor View
const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
const downloadZipBtn = document.getElementById('downloadZipBtn') as HTMLButtonElement;
const downloadEpubBtn = document.getElementById('downloadEpubBtn') as HTMLButtonElement;
const chapterList = document.getElementById('chapterList') as HTMLElement;
const chapterContent = document.getElementById('chapterContent') as HTMLTextAreaElement;
const splitChapterBtn = document.getElementById('splitChapterBtn') as HTMLButtonElement;
const saveChapterBtn = document.getElementById('saveChapterBtn') as HTMLButtonElement;


// Progress Bar
const progressContainer = document.getElementById('progressContainer') as HTMLElement;
const progressBar = document.getElementById('progressBar') as HTMLElement;
const progressText = document.getElementById('progressText') as HTMLElement;

// Fix: Add interface for Chapter object
interface Chapter {
  id: number;
  title: string;
  content: string;
}

// State
let fileContent = '';
let fileName = '';
let coverFile: File | null = null;
let chapters: Chapter[] = [];
let selectedChapterId: number | null = null;
let isDirty = false; // For tracking unsaved changes in textarea

// Helpers
function setStatus(msg: string, type?: string){
  statusDiv.textContent = msg;
  statusDiv.className = 'status small'; // Reset classes
  if(type) statusDiv.classList.add(type);
}
function showProgress(){ progressContainer.style.display = 'block'; updateProgress(0,''); }
function hideProgress(){ progressContainer.style.display = 'none'; }
function updateProgress(pct: number, msg: string){
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  progressBar.style.width = v + '%';
  progressText.textContent = v + '%' + (msg ? (' – ' + msg) : '');
  // Fix: Argument of type 'number' is not assignable to parameter of type 'string'.
  progressBar.setAttribute('aria-valuenow', String(v));
  progressText.setAttribute('aria-label', `${v}% ${msg}`);
}
function safeFilename(name: string | null | undefined){
  return String(name || '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 180) || 'untitled';
}
async function decodeText(buffer: ArrayBuffer, encoding: string) {
  if (encoding === 'auto') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }

    try { return new TextDecoder('gbk', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }

    try { return new TextDecoder('big5', { fatal: true }).decode(buffer); }
    catch (e) { /* ignore and try next */ }
    
    setStatus('Auto-detection failed; file might be in an unsupported encoding. Displaying with UTF-8.', 'error');
    return new TextDecoder('utf-8').decode(buffer);
  } else {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  }
}
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer>{
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}
function downloadFile(blob: Blob, filename: string){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function escapeHtml(s: string){
  const d = document.createElement('div');
  d.innerText = s;
  return d.innerHTML;
}
function getCoverExtension(mime: string){
  const map: Record<string, string> = {'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'};
  return map[mime] || 'img';
}

// Chapter detection templates
const CHAPTER_TEMPLATES: Record<string, RegExp> = {
  chinese: /^\s*第\s*([0-9]+)\s*章[\.。:\s]?.*$/im,
  chinese_numeral: /^\s*第\s*([一二三四五六七八九十百千零〇]+)\s*章.*$/im,
  chapter: /^\s*Chapter\s*([0-9]+)\b.*$/im,
  ch: /^\s*Ch(?:apter)?\.?\s*([0-9]+)\b.*$/im,
  titledot: /^\s*([^\r\n]{1,120})\.\s*\d+\s*$/uim,
  parenfullwidth: /^\s*（\s*\d+\s*\.?\s*）\s*$/uim
};

function detectPattern(lines: string[]) {
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
        } catch (e: any) {
            return { rx: null, key: 'custom', error: `Invalid Regex: ${e.message}` };
        }
    }
    if (selected === 'auto') {
        const lines = (fileContent || '').split(/\r?\n/);
        const detected = detectPattern(lines);
        if (detected) {
            chapterPatternSelect.value = detected.key; // QOL improvement
            return detected;
        }
        return { rx: null, key: 'auto', error: 'Auto-detect found no repeated heading pattern in first 400 lines.' };
    }
    return { rx: CHAPTER_TEMPLATES[selected] || null, key: selected };
}

function getExampleMatches(rx: RegExp, lines: string[]) {
  const arr: string[] = [];
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

  // Fix: The 'info' object might not have an 'error' property. Use the 'in' operator to check for its existence, which acts as a type guard for TypeScript.
  if('error' in info && info.error){
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

function applyCleanupRules(text: string) {
    let processedText = text;
    // Fix: Property 'value' does not exist on type 'Element'. Use generic querySelectorAll.
    const ruleInputs = cleanupRulesContainer.querySelectorAll<HTMLInputElement>('input[type="text"]');
    ruleInputs.forEach(input => {
        const pattern = input.value.trim();
        if (pattern) {
            try {
                const regex = new RegExp(pattern, 'gim');
                processedText = processedText.replace(regex, '');
            } catch (e) {
                console.warn(`Invalid cleanup regex: ${pattern}`, e);
            }
        }
    });
    return processedText;
}


function splitChapters(text: string): Chapter[] | null {
  const cleanedText = applyCleanupRules(text);
  const lines = String(cleanedText).split(/\r?\n/);
  const info = getActiveRegexInfo();
  
  // Fix: The 'info' object might not have an 'error' property. Use the 'in' operator to check for its existence, which acts as a type guard for TypeScript.
  if ('error' in info && info.error) {
    setStatus(info.error, 'error');
    return null;
  }

  const rx = info.rx;
  let currentChapters: Omit<Chapter, 'id'>[] = [];
  let current: Omit<Chapter, 'id'> | null = null;
  const pushCurrent = () => { if(current) currentChapters.push(current); };

  if(!rx){
    currentChapters.push({ title: 'synopsis', content: cleanedText.trim() });
  } else {
    let preface: string[] = [];
    for(const raw of lines){
      const line = String(raw || '');
      if(rx.test(line)){
        pushCurrent();
        current = { title: line.trim(), content: '' };
      } else {
        if(!current) {
          preface.push(line);
        } else {
          // Append line, adding a newline separator if content already exists.
          // This avoids an artificial trailing newline on the last line of the chapter.
          if (current.content) {
            current.content += '\n' + line;
          } else {
            current.content = line;
          }
        }
      }
    }
    pushCurrent();
    const prefaceContent = preface.join('\n').trim();
    if (prefaceContent) {
        currentChapters.unshift({ title: 'synopsis', content: prefaceContent });
    }
  }
  
  // Add unique IDs
  return currentChapters.map((ch, i) => ({ ...ch, id: i }));
}

// Editor functionality
function renderEditor() {
    chapterList.innerHTML = '';
    chapters.forEach((chapter, index) => {
        const li = document.createElement('li');
        li.dataset.id = String(chapter.id);
        li.draggable = true;

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = chapter.title;
        titleInput.className = 'chapter-title';
        // Fix: Property 'value' does not exist on type 'EventTarget'. Cast target to HTMLInputElement.
        titleInput.addEventListener('change', e => {
            chapter.title = (e.target as HTMLInputElement).value;
        });

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chapter-actions';

        const mergeBtn = document.createElement('button');
        mergeBtn.textContent = 'Merge ↓';
        mergeBtn.title = 'Merge this chapter down into the one above it';
        mergeBtn.dataset.action = 'merge';
        if (index === 0) mergeBtn.disabled = true;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Del';
        deleteBtn.title = 'Delete this chapter';
        deleteBtn.dataset.action = 'delete';
        
        actionsDiv.append(mergeBtn, deleteBtn);
        li.append(titleInput, actionsDiv);
        chapterList.appendChild(li);

        if (chapter.id === selectedChapterId) {
            li.classList.add('selected');
        }
    });
}

function selectChapter(id: number | null) {
    if (isDirty) {
        if (!confirm('You have unsaved changes. Are you sure you want to switch chapters?')) {
            return;
        }
    }
    selectedChapterId = id;
    const chapter = chapters.find(c => c.id === id);
    if (chapter) {
        chapterContent.value = chapter.content;
        splitChapterBtn.disabled = false;
        saveChapterBtn.disabled = true;
        isDirty = false;
    } else {
        chapterContent.value = '';
        splitChapterBtn.disabled = true;
        saveChapterBtn.disabled = true;
    }
    renderEditor();
}

function saveCurrentChapter() {
    if (selectedChapterId !== null) {
        const chapter = chapters.find(c => c.id === selectedChapterId);
        if (chapter) {
            chapter.content = chapterContent.value;
            isDirty = false;
            saveChapterBtn.disabled = true;
        }
    }
}

// XHTML/EPUB Builders
function getEpubStyles(theme: string) {
    switch(theme) {
        case 'classic':
            // Use margin for paragraph separation instead of text-indent.
            // white-space: pre-wrap preserves indentation from the source file.
            return `body{font-family:serif, "Times New Roman", Times;} p{margin:0 0 0.75em 0; text-indent:0; white-space: pre-wrap;}`;
        case 'minimal':
            return `body{margin:5px;} p{margin-bottom:1em; text-indent:0; white-space: pre-wrap;}`;
        case 'modern':
        default:
            return `body{font-family:sans-serif,"Helvetica Neue",Helvetica,Arial;} p{margin:0 0 1em; text-indent:0; white-space: pre-wrap;}`;
    }
}

async function createZipDownload(chaptersToExport: Chapter[]){
  showProgress();
  updateProgress(5, 'Preparing ZIP…');
  const zip = new JSZip();
  const base = safeFilename((fileName || 'novel').replace(/\.txt$/i, ''));
  const total = chaptersToExport.length;
  for(let i=0;i<total;i++){
    const ch = chaptersToExport[i];
    const namePart = (i === 0 && ch.title.toLowerCase() === 'synopsis') ? 'synopsis' : (ch.title || `chapter${i}`);
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
  setTimeout(hideProgress, 500);
}

async function createEpubDownload(chaptersToExport: Chapter[]) {
    showProgress();
    updateProgress(5, 'Preparing EPUB...');
    const zip = new JSZip();
    const base = safeFilename((fileName || 'novel').replace(/\.txt$/i, ''));
    const bookId = crypto.randomUUID();
    const titleMeta = metaTitle.value.trim() || base;
    const authorMeta = metaAuthor.value.trim() || 'Unknown Author';
    const lang = 'zh'; // Assuming Chinese, can be made configurable later
    const modifiedDate = new Date().toISOString().split('T')[0];

    // 1. mimetype
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. container.xml
    zip.file('META-INF/container.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    const oebps = zip.folder('OEBPS');

    // 3. style.css
    oebps.file('style.css', getEpubStyles(epubTheme.value));

    // 4. Cover image
    let coverHref: string | null = null;
    let coverMediaType: string | null = null;
    if (coverFile) {
        const ext = getCoverExtension(coverFile.type);
        const ab = await readFileAsArrayBuffer(coverFile);
        coverHref = `cover.${ext}`;
        coverMediaType = coverFile.type || 'image/jpeg';
        oebps.file(coverHref, ab);
    }
    
    // 5. Chapter XHTML files
    const manifestItems: { id: string; href: string; type: string; prop?: string }[] = [];
    const spineItems: string[] = [];
    const navListItems: string[] = [];
    const ncxNavPoints: string[] = [];

    for (let i = 0; i < chaptersToExport.length; i++) {
        const ch = chaptersToExport[i];
        const id = `chap${i}`;
        const href = `text/${id}.xhtml`;
        
        const paragraphs = String(ch.content || '').split(/\r?\n/);
        const body = paragraphs
            .map(line => `<p>${escapeHtml(line)}</p>`)
            .join('\n  ');
        const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="../style.css" />
</head>
<body>
  <h2>${escapeHtml(ch.title)}</h2>
  ${body}
</body>
</html>`;
        oebps.file(href, xhtml);

        manifestItems.push({ id, href, type: 'application/xhtml+xml' });
        spineItems.push(id);
        navListItems.push(`<li><a href="${href}">${escapeHtml(ch.title)}</a></li>`);
        ncxNavPoints.push(`<navPoint id="nav-${id}" playOrder="${i + 1}">
  <navLabel><text>${escapeHtml(ch.title)}</text></navLabel>
  <content src="${href}"/>
</navPoint>`);

        updateProgress(10 + (i / chaptersToExport.length) * 60, `Adding ${ch.title}`);
        await new Promise(r => setTimeout(r, 0));
    }

    manifestItems.push({ id: 'css', href: 'style.css', type: 'text/css' });
    if (coverHref && coverMediaType) {
        manifestItems.push({ id: 'cover', href: coverHref, type: coverMediaType, prop: 'cover-image' });
    }

    // nav.xhtml (EPUB 3)
    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}">
<head>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      ${navListItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
    oebps.file('nav.xhtml', navXhtml);
    manifestItems.push({ id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', prop: 'nav' });

    // toc.ncx (EPUB 2)
    const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
  <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
</head>
<docTitle>
  <text>${escapeHtml(titleMeta)}</text>
</docTitle>
<navMap>
  ${ncxNavPoints.join('\n  ')}
</navMap>
</ncx>`;
    oebps.file('toc.ncx', tocNcx);
    manifestItems.push({ id: 'ncx', href: 'toc.ncx', type: 'application/x-dtbncx+xml' });

    // 7. package.opf
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeHtml(titleMeta)}</dc:title>
    <dc:creator id="creator">${escapeHtml(authorMeta)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${modifiedDate}</meta>
    ${coverHref ? '<meta name="cover" content="cover"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.map(m => `<item id="${m.id}" href="${m.href}" media-type="${m.type}"${m.prop ? ` properties="${m.prop}"` : ''}/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.map(id => `<itemref idref="${id}"/>`).join('\n    ')}
  </spine>
</package>`;
    oebps.file('package.opf', opf);

    updateProgress(95, 'Packaging EPUB…');
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const outName = `${base}.epub`;
    downloadFile(blob, outName);
    updateProgress(100, 'Done');
    setTimeout(hideProgress, 500);
}


// Event handlers
async function handleFileInput(f: File | null | undefined) {
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
    processBtn.disabled = false;
    showMatchPreview();
    updateProgress(100, 'Ready');
    setTimeout(hideProgress, 300);
  }catch(err){
    console.error(err);
    hideProgress();
    setStatus('Failed to read file.', 'error');
  }
}

// Fix: Cast event target to HTMLInputElement to access files property
fileInput.addEventListener('change', (e) => handleFileInput((e.target as HTMLInputElement).files?.[0]));

function handleCoverInput(f: File | null | undefined) {
  coverFile = f || null;
  if(coverFile){
    if(!String(coverFile.type || '').startsWith('image/')){
      setStatus('Cover must be an image file.', 'error');
      coverFile = null;
      coverNameInfo.textContent = 'Or drag and drop image here';
      return;
    }
    coverNameInfo.textContent = `Cover: ${coverFile.name}`;
    setStatus(`Cover loaded: ${coverFile.name}`, 'success');
  } else {
    coverNameInfo.textContent = 'Or drag and drop image here';
  }
}

// Fix: Cast event target to HTMLInputElement to access files property
coverInput.addEventListener('change', (e) => handleCoverInput((e.target as HTMLInputElement).files?.[0]));

// Drag and Drop
function setupDropZone(zone: HTMLElement, input: HTMLInputElement, handler: (f: File) => void) {
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
            input.files = e.dataTransfer.files; // To make it consistent
            handler(file);
        }
    });
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });
}
setupDropZone(fileDropZone, fileInput, handleFileInput as (f: File) => void);
setupDropZone(coverDropZone, coverInput, handleCoverInput as (f: File) => void);

chapterPatternSelect.addEventListener('change', () => {
  customRegexContainer.style.display = chapterPatternSelect.value === 'custom' ? 'block' : 'none';
  showMatchPreview();
});

customRegexInput.addEventListener('input', showMatchPreview);

addRuleBtn.addEventListener('click', () => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter regex pattern to remove...';
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'small-btn';
    removeBtn.onclick = () => ruleItem.remove();
    ruleItem.append(input, removeBtn);
    cleanupRulesContainer.appendChild(ruleItem);
});

processBtn.addEventListener('click', () => {
  if(!fileContent){ setStatus('Select a .txt file first.', 'error'); return; }
  setStatus(`Processing…`);
  const result = splitChapters(fileContent);
  if (!result) return;
  
  chapters = result;
  selectedChapterId = chapters.length > 0 ? chapters[0].id : null;
  isDirty = false;
  
  setupView.style.display = 'none';
  editorView.style.display = 'block';
  
  selectChapter(selectedChapterId); // This also calls renderEditor
});

backBtn.addEventListener('click', () => {
    if (isDirty) {
        if (!confirm('You have unsaved changes. Are you sure you want to go back? All edits will be lost.')) {
            return;
        }
    }
    setupView.style.display = 'block';
    editorView.style.display = 'none';
});

downloadZipBtn.addEventListener('click', () => {
    if (isDirty) saveCurrentChapter();
    createZipDownload(chapters);
});
downloadEpubBtn.addEventListener('click', () => {
    if (isDirty) saveCurrentChapter();
    createEpubDownload(chapters);
});


chapterList.addEventListener('click', (e) => {
    const li = (e.target as Element).closest('li');
    if (!li) return;

    const idStr = li.dataset.id;
    if (!idStr) return;
    const id = parseInt(idStr, 10);

    // Handle button clicks (delete/merge)
    if ((e.target as Element).tagName === 'BUTTON') {
        const index = chapters.findIndex(c => c.id === id);
        // Failsafe: if the chapter ID from the DOM doesn't exist in our state, do nothing.
        if (index === -1) {
            console.error(`Chapter with ID ${id} not found in state.`);
            return;
        }

        const action = (e.target as HTMLButtonElement).dataset.action;
        
        if (action === 'delete') {
            if (confirm(`Are you sure you want to delete "${chapters[index].title}"?`)) {
                const deletedId = chapters[index].id;
                chapters.splice(index, 1);
                
                if (deletedId === selectedChapterId) {
                    // The active chapter was deleted, so select "nothing" to clear the editor
                    selectChapter(null);
                } else {
                    // A different chapter was deleted, just re-render the list
                    renderEditor();
                }
            }
        } else if (action === 'merge') {
            if (index > 0) {
                const chapterToMerge = chapters[index];
                const targetChapter = chapters[index-1];
                targetChapter.content += '\n\n' + chapterToMerge.content;
                chapters.splice(index, 1);
                
                if (id === selectedChapterId) {
                    // If the merged chapter was selected, select the one it was merged into
                    selectChapter(targetChapter.id);
                } else {
                    renderEditor();
                }
            }
        }
    // Handle clicks on the list item itself (not on buttons or inputs) to select it
    } else if ((e.target as Element).tagName !== 'INPUT') {
        selectChapter(id);
    }
});

// Drag and drop for reordering
let draggedItem: HTMLElement | null = null;
chapterList.addEventListener('dragstart', (e) => {
    // Fix: Cast e.target to Element to use .closest()
    draggedItem = (e.target as Element).closest('li');
});
chapterList.addEventListener('dragover', (e) => {
    e.preventDefault();
    // Fix: Cast e.target to Element to use .closest()
    const target = (e.target as Element).closest('li');
    if (target && target !== draggedItem) {
        // Simple visual feedback by adding a class to the target
        document.querySelectorAll('.drag-over-item').forEach(el => el.classList.remove('drag-over-item'));
        target.classList.add('drag-over-item');
    }
});
chapterList.addEventListener('dragleave', (e) => {
    // Fix: Cast e.target to Element to use .closest()
    (e.target as Element).closest('li')?.classList.remove('drag-over-item');
});
chapterList.addEventListener('drop', (e) => {
    e.preventDefault();
    document.querySelectorAll('.drag-over-item').forEach(el => el.classList.remove('drag-over-item'));
    // Fix: Cast e.target to Element to use .closest()
    const target = (e.target as Element).closest('li');
    if (target && draggedItem && target !== draggedItem) {
        const fromId = parseInt(draggedItem.dataset.id!, 10);
        const toId = parseInt(target.dataset.id!, 10);
        const fromIndex = chapters.findIndex(c => c.id === fromId);
        const toIndex = chapters.findIndex(c => c.id === toId);
        
        const [movedItem] = chapters.splice(fromIndex, 1);
        chapters.splice(toIndex, 0, movedItem);
        
        renderEditor();
    }
    draggedItem = null;
});


chapterContent.addEventListener('input', () => {
    isDirty = true;
    saveChapterBtn.disabled = false;
});
saveChapterBtn.addEventListener('click', saveCurrentChapter);

splitChapterBtn.addEventListener('click', () => {
    if (selectedChapterId === null) return;
    const splitPos = chapterContent.selectionStart;
    const index = chapters.findIndex(c => c.id === selectedChapterId);
    if (index === -1) return;

    const currentChapter = chapters[index];
    const originalContent = currentChapter.content;
    const part1 = originalContent.substring(0, splitPos);
    const part2 = originalContent.substring(splitPos);

    if (part2.trim() === '') {
        alert("Cannot split at the end of the chapter.");
        return;
    }

    currentChapter.content = part1;
    if (!/\(Part \d+\)$/i.test(currentChapter.title)) {
        currentChapter.title += ' (Part 1)';
    }
    
    const newId = Math.max(...chapters.map(c => c.id)) + 1;
    const newChapter: Chapter = {
        id: newId,
        title: `${currentChapter.title.replace(/\(Part \d+\)$/i, '')} (Part 2)`.trim(),
        content: part2
    };

    chapters.splice(index + 1, 0, newChapter);
    chapterContent.value = part1; // Update textarea
    isDirty = false;
    saveChapterBtn.disabled = true;
    renderEditor();
});

window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Required for some browsers
    }
});
