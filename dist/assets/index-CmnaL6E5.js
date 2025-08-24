(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))r(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&r(c)}).observe(document,{childList:!0,subtree:!0});function n(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function r(o){if(o.ep)return;o.ep=!0;const i=n(o);fetch(o.href,i)}})();const K=document.getElementById("fileInput"),Y=document.getElementById("coverInput"),L=document.getElementById("chapterPattern"),q=document.getElementById("customRegexContainer"),A=document.getElementById("customRegexInput"),J=document.getElementById("encodingSelect"),X=document.getElementById("fileNameInfo"),B=document.getElementById("coverNameInfo"),N=document.getElementById("processZipBtn"),O=document.getElementById("processEpubBtn"),M=document.getElementById("progressContainer"),G=document.getElementById("progressBar"),W=document.getElementById("progressText"),T=document.getElementById("status"),h=document.getElementById("matchPreview"),Q=document.getElementById("metaTitle"),V=document.getElementById("metaAuthor");let y="",v="",m=null;function a(t,e){T.textContent=t,T.className="status small",e&&T.classList.add(e)}function S(){M.style.display="block",l(0,"")}function E(){M.style.display="none"}function l(t,e){const n=Math.max(0,Math.min(100,Math.round(t)));G.style.width=n+"%",W.textContent=n+"%"+(e?" – "+e:"")}function P(t){return String(t||"").replace(/[\u0000-\u001f]/g,"").replace(/[\\\/:*?"<>|]/g,"").replace(/\s+/g,"_").slice(0,180)||"untitled"}async function ee(t,e){if(e==="auto"){try{return new TextDecoder("utf-8",{fatal:!0}).decode(t)}catch{}try{return new TextDecoder("gbk",{fatal:!0}).decode(t)}catch{}try{return new TextDecoder("big5",{fatal:!0}).decode(t)}catch{}return a("Auto-detection failed; file might be in an unsupported encoding. Displaying with UTF-8.","error"),new TextDecoder("utf-8").decode(t)}else return new TextDecoder(e,{fatal:!1}).decode(t)}function R(t){return new Promise((e,n)=>{const r=new FileReader;r.onload=()=>e(r.result),r.onerror=n,r.readAsArrayBuffer(t)})}function j(t,e){const n=document.createElement("a");n.href=URL.createObjectURL(t),n.download=e,document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(n.href),1500)}function te(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,t=>{const e=Math.random()*16|0;return(t==="x"?e:e&3|8).toString(16)})}function x(t){const e=document.createElement("div");return e.innerText=t,e.innerHTML}function ne(t){return{"image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/svg+xml":"svg"}[t]||"img"}const w={chinese:/^\s*第\s*([0-9]+)\s*章[\.。:\s]?.*$/im,chinese_numeral:/^\s*第\s*([一二三四五六七八九十百千零〇]+)\s*章.*$/im,chapter:/^\s*Chapter\s*([0-9]+)\b.*$/im,ch:/^\s*Ch(?:apter)?\.?\s*([0-9]+)\b.*$/im,titledot:/^\s*([^\r\n]{1,120})\.\s*\d+\s*$/uim,parenfullwidth:/^\s*（\s*\d+\s*\.?\s*）\s*$/uim};function oe(t){for(const e in w){const n=w[e];let r=0;for(let o=0;o<Math.min(t.length,400);o++)if(n.test(t[o])&&(r++,r>1))return{key:e,rx:n}}return null}function F(){const t=L.value;if(t==="custom"){const e=A.value;if(!e)return{rx:null,key:"custom",error:"Please enter a custom Regex pattern."};try{return{rx:new RegExp(e,"im"),key:"custom"}}catch(n){return{rx:null,key:"custom",error:`Invalid Regex: ${n.message}`}}}if(t==="auto"){const e=(y||"").split(/\r?\n/),n=oe(e);return n||{rx:null,key:"auto",error:"Auto-detect found no repeated heading pattern in first 400 lines."}}return{rx:w[t]||null,key:t}}function re(t,e){const n=[];for(let r=0;r<Math.min(e.length,500)&&(t.test(e[r])&&n.push(e[r].trim()),!(n.length>=5));r++);return n}function D(){if(!y){h.style.display="none";return}const t=y.split(/\r?\n/),e=F();if(h.style.display="block",e.error){h.textContent=e.error;return}if(!e.rx){h.textContent="No pattern selected or detected.";return}const n=re(e.rx,t);if(n.length){let r="";e.key==="auto"&&e.rx&&(r=`Auto-detected: ${Object.keys(w).find(i=>w[i]===e.rx)}. `),h.textContent=`${r}Matches: ${n.join(" | ")}`}else h.textContent="No matches found for this pattern in the first 500 lines."}function ie(t){const e=String(t).split(/\r?\n/),n=F();if(n.error)return a(n.error,"error"),null;const r=n.rx,o=[];let i=null;const c=()=>{i&&o.push(i)};if(!r)return o.push({title:"synopsis",content:t.trim()}),o;let d=[];for(const u of e){const p=String(u||"");r.test(p)?(c(),i={title:p.trim(),content:""}):i?i.content+=p+`
`:d.push(p)}return c(),o.unshift({title:"synopsis",content:d.join(`
`).trim()}),o}function se(t,e){const r=String(e||"").split(/\r?\n/).map(o=>o.trim()).filter(Boolean).map(o=>`<p>${x(o)}</p>`).join(`
`);return`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh" lang="zh">
<head>
  <meta charset="utf-8" />
  <title>${x(t||"")}</title>
</head>
<body>
  <h2>${x(t||"")}</h2>
  ${r}
</body>
</html>`}async function ce(t){S(),l(5,"Preparing ZIP…");const e=new JSZip,n=P((v||"novel").replace(/\.txt$/i,"")),r=t.length;for(let c=0;c<r;c++){const d=t[c],u=c===0?"synopsis":d.title||`chapter${c}`,$=`${String(c).padStart(3,"0")}_${P(u)}.txt`;e.file($,d.content||""),l(10+c/r*80,`Adding ${$}`),await new Promise(g=>setTimeout(g,0))}l(95,"Generating ZIP…");const o=await e.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}}),i=`${n}_chapters.zip`;j(o,i),l(100,"Done"),E(),a(`Downloaded ${i}`,"success")}async function ae(t){S(),l(5,"Preparing EPUB…");const e=new JSZip,n=P((v||"novel").replace(/\.txt$/i,"")),r=te(),o=Q.value.trim()||n,i=V.value.trim()||"Unknown",c="zh";e.file("mimetype","application/epub+zip",{compression:"STORE"}),e.file("META-INF/container.xml",`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);const d=e.folder("OEBPS");let u=null;if(m){const s=ne(m.type),f=await R(m),b=`cover.${s}`;d.file(b,f),u=b}const p=[];for(let s=0;s<t.length;s++){const f=t[s],b=s===0?"synopsis":f.title||`chapter${s}`,C=`${String(s).padStart(3,"0")}_${P(b)}.xhtml`,_=se(f.title,f.content);d.file(C,_),p.push({id:`chap${s}`,href:C,title:f.title||`Chapter ${s}`}),l(10+s/t.length*70,`Adding ${C}`),await new Promise(H=>setTimeout(H,0))}if(u){const s=`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${c}" lang="${c}">
<head><meta charset="utf-8"/><title>Cover</title></head>
<body style="margin:0;padding:0;text-align:center;">
  <img src="${u}" alt="Cover" style="max-width:100%;height:auto;"/>
</body>
</html>`;d.file("cover.xhtml",s)}const $=p.map((s,f)=>`<navPoint id="navPoint-${f+1}" playOrder="${f+1}">
  <navLabel><text>${x(s.title)}</text></navLabel>
  <content src="${s.href}"/>
</navPoint>`).join(`
`);d.file("toc.ncx",`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${r}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${x(o)}</text></docTitle>
  <navMap>
${$}
  </navMap>
</ncx>`);const g=[],I=[];g.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'),u&&m&&(g.push(`<item id="cover-image" href="${u}" media-type="${m.type||"image/jpeg"}"/>`),g.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'),I.push('<itemref idref="cover" linear="yes"/>'));for(const s of p)g.push(`<item id="${s.id}" href="${s.href}" media-type="application/xhtml+xml"/>`),I.push(`<itemref idref="${s.id}" linear="yes"/>`);const z=`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${x(o)}</dc:title>
    <dc:creator>${x(i)}</dc:creator>
    <dc:language>${c}</dc:language>
    <dc:identifier id="BookId">urn:uuid:${r}</dc:identifier>
`+(u?`    <meta name="cover" content="cover-image"/>
`:"")+`  </metadata>
  <manifest>
    ${g.join(`
    `)}
  </manifest>
  <spine toc="ncx">
    ${I.join(`
    `)}
  </spine>
</package>`;d.file("content.opf",z),l(95,"Packaging EPUB…");const Z=await e.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}}),k=`${n}.epub`;j(Z,k),l(100,"Done"),E(),a(`Downloaded ${k}`,"success")}K.addEventListener("change",async t=>{const e=t.target.files&&t.target.files[0];if(!e){a("No file selected","error");return}if(!(e.type==="text/plain"||/\.txt$/i.test(e.name))){a("Please choose a .txt file.","error");return}try{S(),l(5,"Reading file…");const n=await R(e);l(25,"Decoding text…");const r=J.value;y=await ee(n,r),v=e.name||"novel.txt",X.textContent=`Loaded: ${v}`,a(`Loaded: ${v}`,"success"),N.disabled=!1,O.disabled=!1,D(),l(100,"Ready"),setTimeout(E,300)}catch(n){console.error(n),E(),a("Failed to read file.","error")}});Y.addEventListener("change",t=>{if(m=t.target.files&&t.target.files[0]?t.target.files[0]:null,m){if(!String(m.type||"").startsWith("image/")){a("Cover must be an image file.","error"),m=null,B.textContent="";return}B.textContent=`Cover: ${m.name}`,a(`Cover loaded: ${m.name}`,"success")}else B.textContent=""});L.addEventListener("change",()=>{q.style.display=L.value==="custom"?"block":"none",D()});A.addEventListener("input",D);async function U(t){if(!y){a("Select a .txt file first.","error");return}a(`Processing ${t.toUpperCase()}…`);try{const e=ie(y);if(!e)return;t==="zip"?await ce(e):await ae(e)}catch(e){console.error(e),a(`Error creating ${t.toUpperCase()}.`,"error")}}N.addEventListener("click",()=>U("zip"));O.addEventListener("click",()=>U("epub"));
