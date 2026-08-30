const workspaceApiOrigin = 'http://127.0.0.1:4173';
if (location.origin !== workspaceApiOrigin) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    return typeof url === 'string' && url.startsWith('/api/') ? nativeFetch(`${workspaceApiOrigin}${url}`, init) : nativeFetch(input, init);
  };
}

const files = {
  "正文": [], "提示词": [], "知识库": [], "词汇库": [], "剧情": [], "提取": []
};
const fileState = {};
const fileList = document.querySelector('#fileList');
const documentTabs = document.querySelector('#documentTabs');
const content = document.querySelector('#documentContent');
const path = document.querySelector('#documentPath');
const footer = document.querySelector('#documentFooter');
const preview = document.querySelector('#documentPreview');
const editButton = document.querySelector('#editButton');
const sidebarToggle = document.querySelector('#sidebarToggle');
const applySidebarState = collapsed => { document.querySelector('.app-shell').classList.toggle('sidebar-collapsed', collapsed); sidebarToggle.setAttribute('aria-label', collapsed ? '展开侧栏' : '折叠侧栏'); };
applySidebarState(localStorage.getItem('novel:sidebar-collapsed') === 'true');
sidebarToggle.addEventListener('click', () => { const collapsed = !document.querySelector('.app-shell').classList.contains('sidebar-collapsed'); localStorage.setItem('novel:sidebar-collapsed', String(collapsed)); applySidebarState(collapsed); });
let openFiles = [];
let currentFile = '';
let editing = false;
let editStartValue = '';

function markdownEscape(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function markdownInline(value) { return markdownEscape(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r/g, '').split('\n'); let html='', paragraph=[];
  const flush = () => { if (paragraph.length) { html += `<p>${paragraph.map(markdownInline).join('<br>')}</p>`; paragraph.length=0; } };
  for (let index=0; index<lines.length; index += 1) {
    const line=lines[index], heading=line.match(/^(#{1,3})\s+(.+)$/), bullet=line.match(/^[-*]\s+(.+)$/);
    if (/^\|.*\|\s*$/.test(line) && /^\|\s*[-:]+/.test(lines[index+1] || '')) { flush(); const headers=line.split('|').slice(1,-1).map(cell=>`<th>${markdownInline(cell.trim())}</th>`).join(''); index += 2; let rows=''; while (/^\|.*\|\s*$/.test(lines[index] || '')) { rows += `<tr>${lines[index].split('|').slice(1,-1).map(cell=>`<td>${markdownInline(cell.trim())}</td>`).join('')}</tr>`; index += 1; } index -= 1; html += `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`; continue; }
    if (heading) { flush(); html += `<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`; continue; }
    if (/^---\s*$/.test(line)) { flush(); html += '<hr>'; continue; }
    if (bullet) { flush(); html += `<ul><li>${markdownInline(bullet[1])}</li></ul>`; continue; }
    if (!line.trim()) { flush(); continue; } paragraph.push(line);
  }
  flush(); return html || '<p class="markdown-empty">文件为空</p>';
}
function renderJson(source) {
  try {
    const parsed = JSON.parse(source || '{}');
    const html = JSON.stringify(parsed, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="json-view">${html}</pre>`;
  } catch (_) {
    return renderMarkdown(source);
  }
}
function renderFiles(group) { fileList.innerHTML = files[group].map(name => { const label=group==='正文' ? (window.novelLocal?.chapterDisplay?.(name) || name) : name; return `<button class="file-row ${name === currentFile ? 'active' : ''}" data-file="${name}"><span class="file-glyph"></span>${label}</button>`; }).join(''); }
function renderTabs() { documentTabs.innerHTML = openFiles.map(name => `<button class="document-tab ${name === currentFile ? 'active' : ''}" data-tab="${name}"><span>${name}</span><span class="tab-close" data-close="${name}" aria-label="关闭 ${name}">×</span></button>`).join(''); }
function setEditorMode(nextEditing) { editing = nextEditing; content.readOnly = !editing; content.classList.toggle('hidden', !editing); preview.classList.toggle('hidden', editing); if (!editing) preview.innerHTML=currentFile.toLowerCase().endsWith('.json') ? renderJson(content.value) : renderMarkdown(content.value); editButton.textContent = editing ? '保存' : '编辑'; editButton.classList.toggle('editing', editing); document.querySelector('#undoEdit').classList.toggle('hidden', !editing); document.querySelector('#cancelEdit').classList.toggle('hidden', !editing); footer.textContent = editing ? '编辑模式：Markdown 源码尚未保存' : 'Markdown 预览模式'; }
function openFile(rawName) { const raw=String(rawName||''), name=raw.split(/[\\/]/).pop(); window.novelSettings?.openWorkspaceForFile?.(); if (!openFiles.includes(name)) openFiles.push(name); currentFile = name; const project=window.novelLocal?.active?.(); let filePath=project?.paths?.[name] || (project?.paths?.[raw] ? project.paths[raw] : ''); if(!filePath && project?.paths){ const hit=Object.entries(project.paths).find(([key, path])=>key===name || key===`${name}.md` || path.endsWith(`/${name}`) || path.endsWith(`/${name}.md`)); if(hit) filePath=hit[1]; } if(!filePath && (raw.includes('/') || raw.includes('\\'))) filePath=raw.replace(/\\/g,'/'); path.textContent = `当前文件 / ${name}`; renderTabs(); document.querySelectorAll('.file-row').forEach(row => row.classList.toggle('active', row.dataset.file === name)); if(filePath){ content.value = fileState[name] || ''; setEditorMode(false); fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(filePath)}`).then(r=>r.ok?r.json():null).then(data=>{ if(data?.content){ const loadedName=data.path.split('/').pop(); fileState[loadedName]=data.content; project.content[loadedName]=data.content; if(currentFile===name || currentFile===loadedName || `${currentFile}.md`===loadedName || currentFile===loadedName.replace(/\.md$/,'')){ content.value=data.content; setEditorMode(false); } } }).catch(()=>{ if(!fileState[name] && !fileState[`${name}.md`]){ content.value=`# ${name}\n\n文件不存在或读取失败。`; setEditorMode(false); } }); } else { content.value=`# ${name}\n\n文件不存在。`; setEditorMode(false); } }
function showToast(message, duration = 1800) { if(/^正在判别/.test(message)){ const messages=document.querySelector('#messages'); messages.querySelectorAll('.generation-pending').forEach(item=>item.remove()); messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message generation-pending"><div class="avatar">AI</div><div><p>${message}</p><div class="generation-progress" role="status" aria-label="正在判别"><i></i></div></div></article>`); messages.scrollTop=messages.scrollHeight; return; } const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.add('hidden'), duration); }
new MutationObserver(records => { if(records.some(record => [...record.addedNodes].some(node => node.nodeType===1 && node.classList.contains('completion')))) document.querySelectorAll('#messages .generation-pending').forEach(item=>item.remove()); }).observe(document.querySelector('#messages'), {childList:true});
function appendUserMessage(text) {
  const value = String(text || '').trim();
  if (!value) return;
  const messages = document.querySelector('#messages');
  const article = document.createElement('article');
  article.className = 'message user-message';
  const body = document.createElement('div');
  body.textContent = value;
  article.appendChild(body);
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
}
function showApiSetupPrompt(message='需要先配置一个可用模型，才能执行这一流程。') { const messages=document.querySelector('#messages'); if(messages.querySelector('.api-setup-prompt'))return; messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message api-setup-prompt"><div class="avatar">AI</div><div><p>${message}</p><p class="form-note">选择提供方、模型并填写 API Key 后，再次点击“下一步”即可继续；当前内容和进度不会丢失。</p><button class="generated-file" type="button" data-open-model-settings>现在配置模型 ›</button></div></article>`); messages.scrollTop=messages.scrollHeight; }
function workflowFailureTitle(error) {
  const detail=error?.message || String(error) || '';
  return /未通过|格式校验|校验未通过|语义校验|只能选择|只能从|格式门禁/.test(detail) && !/HTTP|无法连接|缺少|任务已终止/.test(detail) ? '校验未通过' : '流程未执行';
}
function recordWorkflowFailure(task, label, error) {
  const messages=document.querySelector('#messages'), article=document.createElement('article'), detail=error?.message || String(error) || '未知错误';
  const usage=error?.usage || null;
  const title=workflowFailureTitle(error);
  const isValidation=title==='校验未通过';
  const hasUsage=Boolean(usage && (usage.last || usage.prompt_tokens || usage.completion_tokens || usage.response_time));
  const usageHtml=hasUsage ? `<div class="usage-line">模型：${usage.last?.model || (usage.models && usage.models[0]) || ''} · 输入 ${usage.prompt_tokens||0} · 输出 ${usage.completion_tokens||0} · 耗时 ${usage.response_time||0}s</div>` : '';
  article.className='message assistant-message workflow-failure';
  article.innerHTML=`<div class="avatar">${isValidation ? '✗' : '!'}</div><div><p><strong>${title}</strong></p><p class="form-note"></p>${usageHtml}<details open><summary>错误详情（已保留）</summary><pre></pre></details></div>`;
  article.querySelector('.form-note').textContent=`${new Date().toLocaleString('zh-CN')} · ${label || task}（${task}）`;
  article.querySelector('pre').textContent=detail;
  messages.append(article); messages.scrollTop=messages.scrollHeight;
}
document.addEventListener('click',event=>{if(event.target.closest('[data-open-model-settings]'))document.querySelector('#modelControlButton')?.click();});
function setGenerationTarget(name, file = name) { document.querySelector('#generationTarget').textContent = name; document.querySelector('#generationContext').dataset.file = file; }
document.querySelector('#clearGenerationTarget')?.addEventListener('click', () => setGenerationTarget('未选择',''));
function autoGrowComposer() { const input = document.querySelector('#prompt'); input.style.height = 'auto'; input.style.height = `${Math.min(Math.max(input.scrollHeight, 56), 180)}px`; input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden'; }
function openGenerationPrompt(name, group, verb = '生成', targetName = name) { const input = document.querySelector('#prompt'); setGenerationTarget(targetName, name); input.value = `请${verb}文件：${group}/${name}\n\n`; autoGrowComposer(); input.focus(); }
function clearPastStepActions() { document.querySelectorAll('#messages .completion .message-actions').forEach(actions => actions.remove()); }

document.querySelector('#fileGroups').addEventListener('click', event => { const button = event.target.closest('button[data-group]'); if (!button) return; document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item === button)); renderFiles(button.dataset.group); });
fileList.addEventListener('click', event => { const row = event.target.closest('[data-file]'); if (row) openFile(row.dataset.file); });
documentTabs.addEventListener('click', event => { const close = event.target.closest('[data-close]'); if (close) { const name = close.dataset.close; openFiles = openFiles.filter(file => file !== name); if (!openFiles.length) { currentFile=''; content.value=''; preview.innerHTML=''; path.textContent='当前文件 / 未选择'; renderTabs(); return; } if (currentFile === name) currentFile = openFiles[openFiles.length - 1]; openFile(currentFile); return; } const tab = event.target.closest('[data-tab]'); if (tab) openFile(tab.dataset.tab); });
editButton.addEventListener('click', () => { if (!editing) { editStartValue = content.value; setEditorMode(true); setGenerationTarget(currentFile); content.focus(); showToast(`本次生成：${currentFile}`); return; } fileState[currentFile] = content.value; document.dispatchEvent(new CustomEvent('novel:file-saved', { detail:{ name:currentFile, value:content.value } })); setEditorMode(false); footer.textContent = '已保存'; showToast(`${currentFile} 已保存`); });
document.querySelector('#undoEdit').addEventListener('click', () => { content.value = editStartValue; footer.textContent = '已撤回至开始编辑时的内容'; });
document.querySelector('#cancelEdit').addEventListener('click', () => { content.value = editStartValue; setEditorMode(false); showToast('已取消编辑，未保存修改已放弃'); });
document.querySelector('#chapterPicker').addEventListener('click', () => document.querySelector('#chapterMenu').classList.toggle('hidden'));
document.querySelector('#newProject').addEventListener('click', () => { document.querySelector('#projectModal').classList.remove('hidden'); document.querySelector('#projectName').focus(); });
document.querySelector('#prompt').addEventListener('input', autoGrowComposer);
document.querySelector('#writeModeButton').addEventListener('click', () => { const menu = document.querySelector('#writeModeMenu'); const hidden = menu.classList.toggle('hidden'); document.querySelector('#writeModeButton').setAttribute('aria-expanded', String(!hidden)); });
document.querySelector('#writeModeMenu').addEventListener('click', event => { const option = event.target.closest('[data-write-mode]'); if (!option) return; document.querySelector('#writeModeMenu').classList.add('hidden'); document.querySelector('#writeModeButton').setAttribute('aria-expanded', 'false'); window.novelSettings?.setDefaultMode?.(option.dataset.writeMode); });
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeModal}`).classList.add('hidden')));
document.querySelector('.search-button').addEventListener('click', () => { document.querySelector('#searchPanel').classList.remove('hidden'); document.querySelector('#searchInput').focus(); });
document.querySelector('#closeSearch').addEventListener('click', () => document.querySelector('#searchPanel').classList.add('hidden'));
document.querySelector('#searchForm').addEventListener('submit', event => { event.preventDefault(); const q = document.querySelector('#searchInput').value.trim().toLowerCase(); const results = Object.entries(files).flatMap(([group, names]) => names.filter(name => name.toLowerCase().includes(q)).map(name => ({ group, name }))); document.querySelector('#searchResults').innerHTML = q ? (results.length ? results.map(item => `<button class="search-result" type="button" data-result="${item.name}" data-result-group="${item.group}">${item.group} / ${item.name}</button>`).join('') : '<span>没有匹配的文件</span>') : '<span>请输入关键词后点击“查找”</span>'; });
document.querySelector('#searchResults').addEventListener('click', event => { const result = event.target.closest('[data-result]'); if (!result) return; openFile(result.dataset.result); document.querySelector('#searchPanel').classList.add('hidden'); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === result.dataset.resultGroup)); renderFiles(result.dataset.resultGroup); });
const resizer = document.querySelector('#workspaceResizer'); resizer.addEventListener('pointerdown', event => { resizer.classList.add('dragging'); resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', event => { if (!resizer.classList.contains('dragging')) return; const width = Math.max(360, Math.min(700, window.innerWidth - event.clientX)); document.querySelector('.app-shell').style.setProperty('--workspace-width', `${width}px`); }); resizer.addEventListener('pointerup', () => resizer.classList.remove('dragging'));
const fileResizer = document.querySelector('#fileResizer'); fileResizer.addEventListener('pointerdown', event => { fileResizer.classList.add('dragging'); fileResizer.setPointerCapture(event.pointerId); }); fileResizer.addEventListener('pointermove', event => { if (!fileResizer.classList.contains('dragging')) return; const workspaceTop = document.querySelector('.workspace').getBoundingClientRect().top; const height = Math.max(64, Math.min(360, event.clientY - workspaceTop - 78)); document.querySelector('.file-list').style.setProperty('--file-list-height', `${height}px`); }); fileResizer.addEventListener('pointerup', () => fileResizer.classList.remove('dragging'));
document.querySelector('#modifyInChat').addEventListener('click', () => { openGenerationPrompt(currentFile, '当前文件', '修改'); showToast(`本次生成：${currentFile}`); });
document.querySelector('.header-assets').addEventListener('click', event => { const toggle = event.target.closest('.header-asset-toggle'); if (toggle) { toggle.parentElement.querySelector('.header-asset-actions')?.classList.toggle('hidden'); return; } const action = event.target.closest('[data-header-asset-action]'); if (!action) return; const item = action.closest('.header-asset'); const asset = item?.querySelector('.header-asset-toggle'); if (!asset) return; const name = asset.dataset.asset, group = asset.dataset.group; if (action.dataset.headerAssetAction === 'view') { openFile(name); document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('active', button.dataset.group === group)); renderFiles(group); } if (action.dataset.headerAssetAction === 'modify') { const input = document.querySelector('#prompt'); input.value = `请修改全局文件：${group}/${name}\n\n`; input.focus(); showToast('已将全局文件位置添加到对话框'); } });
renderFiles('正文');

/* 顶部：本章已完成项 + 全局资产。 */
const topAssets = document.querySelector('.header-assets');

/* 保持最初的折叠资产栏：世界观等全局资产不占用当前阶段区域。 */
const stageContext = document.querySelector('.stage-context');
const topRows = document.createElement('div');
topRows.id = 'topAssetRows';
topRows.className = 'top-asset-rows hidden';
const updatableAssets = [
  { name:'小说简介.md', group:'知识库', label:'小说简介' },
  { name:'世界观.md', group:'知识库', label:'世界观' },
  { name:'语言风格.md', group:'知识库', label:'语言风格' },
  { name:'角色名单.md', group:'知识库', label:'角色名单' },
  { name:'角色卡', group:'知识库', label:'角色卡' },
  { name:'关系卡', group:'知识库', label:'关系卡' },
  { name:'信息账本.md', group:'知识库', label:'信息账本' },
  { name:'剧情书.md', group:'剧情', label:'剧情书' }
];
topAssets.innerHTML = updatableAssets.map(item => `<div class="header-asset"><button class="updatable-asset" type="button" data-asset="${item.name}" data-group="${item.group}">${item.label}</button></div>`).join('');
topAssets.addEventListener('click', event => {
  const asset = event.target.closest('.updatable-asset');
  if (!asset) return;
  openGenerationPrompt(asset.dataset.asset, asset.dataset.group, '生成或更新', asset.textContent.trim());
  showToast(`本次生成：${asset.textContent.trim()}`);
});
const globalRow = document.createElement('div');
globalRow.className = 'top-asset-row';
globalRow.innerHTML = '<span class="top-asset-label">可更新</span>';
globalRow.append(topAssets);
topRows.append(globalRow);
stageContext.before(topRows);
document.querySelector('#topRowsToggle').addEventListener('click', () => { const open = topRows.classList.toggle('hidden'); document.querySelector('#topRowsToggle').classList.toggle('expanded', !open); document.querySelector('#topRowsToggle').setAttribute('aria-label', open ? '展开顶部资产' : '收起顶部资产'); });

/* 当前小说管理：菜单放在左侧小说名称后的三点中。 */
const currentProject = document.querySelector('.project.active');
currentProject.insertAdjacentHTML('beforebegin', '<div class="current-project-row"></div>');
const currentProjectRow = document.querySelector('.current-project-row');
currentProjectRow.append(currentProject);
currentProjectRow.insertAdjacentHTML('beforeend', '<div class="current-project-menu-wrap"><button class="current-project-more" id="currentProjectMore" type="button" aria-label="当前小说操作">•••</button><div class="current-project-menu hidden" id="currentProjectMenu"><button type="button" data-project-action="rename">重命名</button><button type="button" data-project-action="upload">上传</button><button class="danger-action" type="button" data-project-action="delete">删除</button></div></div>');
document.querySelector('#currentProjectMore').addEventListener('click', () => document.querySelector('#currentProjectMenu').classList.toggle('hidden'));
document.querySelector('#deleteProject').remove();

/* 同人新建：必须选择原著文件后才允许创建。 */
const projectForm = document.querySelector('#projectForm');
document.querySelector('.project-name-label').insertAdjacentHTML('afterend', '<label class="fan-source hidden" id="fanSource">上传原著文件<input type="file" id="sourceFile" accept=".txt,.md,.doc,.docx" /></label>');
document.querySelectorAll('input[name="projectType"]').forEach(input => input.addEventListener('change', () => document.querySelector('#fanSource').classList.toggle('hidden', input.value !== '同人' || !input.checked)));
projectForm.addEventListener('submit', event => { const type = document.querySelector('input[name="projectType"]:checked').value; const source = document.querySelector('#sourceFile'); if (type === '同人' && !source.files.length) { event.preventDefault(); event.stopImmediatePropagation(); showToast('同人小说需要先上传原著文件'); } }, true);


/* 新建项目专用：不替换原有交互；只有新项目进入初始化状态。 */
(() => {
  const groups = ["正文", "提示词", "知识库", "词汇库", "剧情", "提取"];
  const blankFiles = () => Object.fromEntries(groups.map(group => [group, []]));
  const projects = new Map();
  let activeId = null;
  let restoreQueue = Promise.resolve();
  let lastRetry = null;
  const initCommon = [
    { id:'compile_intro', name:'简介', next:'下一步：生成世界观', output:[['知识库','小说简介.md']] },
    { id:'generate_worldview_json', name:'世界观', next:'下一步：生成语言风格', output:[['知识库','世界观.md']] },
    { id:'compile_style', name:'语言风格', next:'下一步：填写角色名单', output:[['知识库','语言风格.md']] },
    { id:'compile_character_roster', name:'角色名单', next:'下一步：批量生成角色卡', output:[['知识库','角色名单.md']] },
    { id:'generate_characters_batch', name:'批量角色卡', next:'下一步：批量生成关系卡', output:[] },
    { id:'generate_relations_batch', name:'批量关系卡', next:'下一步：生成剧情书', output:[] },
    { id:'compile_plot', name:'剧情书', next:'下一步：生成剧情卷 N', output:[['剧情','剧情书.md']], optional:true },
    { id:'compile_volume', name:'剧情卷 N', next:'下一步：生成信息账本', output:[['剧情','第 1 卷.md']], optional:true },
    { id:'compile_ledger', name:'信息账本', next:'完成初始化', output:[['知识库','信息账本.md']], optional:true },
    { name:'确认初始化', next:'完成初始化', output:[] }
  ];
  const initFan = [
    { id:'text_stats', name:'原文统计', next:'下一步：提取高频词', output:[['提取','原文统计.txt']] },
    { id:'word_frequency', name:'高频词', next:'下一步：提取原文风格', output:[['提取','高频词.txt']] },
    { id:'style', name:'原文风格', next:'下一步：提取正向词库', output:[['提取','原文风格.md']] },
    { id:'positive_vocabulary', name:'正向词库', next:'下一步：提取专属词库', output:[['提取','正向词库.md']] },
    { id:'exclusive_vocabulary', name:'专属词库', next:'下一步：填写小说简介', output:[['提取','专属词库.md']] },
    ...initCommon
  ];
  const initInputSpec = {
    generate_character: { title:'补充角色信息', note:'角色名是角色卡的必填信息；其余描述会一并交给角色卡生成。', fields:[{name:'name',label:'角色姓名',placeholder:'例如：沈砚',required:true},{name:'description',label:'补充描述（可选）',placeholder:'身份、性格、目标、能力等'}] }
  };
  const chapterFlow = [
    { id:'compile_anchor', name:'锚点', next:'下一步：生成配置', file:'强制设定锚点.md', group:'提示词' }, { id:'compile_config', name:'配置', next:'下一步：生成台词', file:'配置.md', group:'提示词' }, { id:'compile_dialogue', name:'台词', next:'下一步：生成提示词', file:'台词.md', group:'提示词' }, { id:'compile_snapshot', name:'提示词', next:'下一步：生成正文', file:'最终提示词快照.md', group:'提示词' }, { id:'generate_prose', name:'正文', next:'下一步：校验与验收', group:'正文' }, { id:'validate', name:'校验与验收', next:'生成校验报告', file:'校验报告.md', group:'提示词', optional:true }
  ];
  const active = () => activeId ? projects.get(activeId) : null;
  const enabled = stage => !stage.id || window.novelSettings?.isStepEnabled?.(stage.id) !== false;
  const stages = project => (project.type === '同人' ? initFan : initCommon).filter(enabled);
  const chapterStages = () => chapterFlow.filter(enabled);
  const chapter = project => project.chapters.find(item => item.id === project.chapterId);
  const add = (project, group, name) => { if (!project.files[group].includes(name)) project.files[group].push(name); };
  function localPath(project, name) {
    if (project.paths?.[name]) return project.paths[name];
    if (name === '小说简介.md' || name === '世界观.md' || name === '世界观.json' || name === '语言风格.md' || name === '信息账本.md') return `知识库/${name}`;
    if (['人物词库.md','对话词库.md','通用词库.md','禁用词库.md'].includes(name)) return `词汇库/${name}`;
    if (name.includes('角色卡')) return `知识库/角色卡/${name}`;
    if (name.includes('关系卡')) return `知识库/关系卡/${name}`;
    if (name === '剧情书.md') return `剧情/${name}`;
    if (name.includes('卷')) return `剧情/剧情卷/${name}`;
    if (['强制设定锚点.md','配置.md','台词.md','最终提示词快照.md','校验报告.md'].includes(name)) return `提示词/${chapter(project)?.name || '未命名章节'}/${name}`;
    if (name.endsWith('.txt')) return `正文/${name}`;
    return `提取/${name}`;
  }
  function initOutputPath(stage, input={}) {
    if (stage.id === 'generate_character' && input.name) return `知识库/角色卡/角色卡-${input.name}.md`;
    if (stage.id === 'compile_relation' && input.character_a && input.character_b) return `知识库/关系卡/关系卡-${input.character_a}-${input.character_b}.md`;
    if (stage.id === 'compile_volume' && input.volume) return `剧情/剧情卷/${input.volume}.md`;
    const output=stage.output?.[0];
    return output ? `${output[0]}/${output[1]}` : '';
  }
  function chapterOutputPath(item, stage) { return stage.id === 'generate_prose' ? `正文/${item.name}.txt` : (stage.file ? `提示词/${item.name}/${stage.file}` : ''); }
  function groupForPath(path) { return path.split('/')[0] || '正文'; }
  async function localFileExists(project, path) { return Boolean(path) && (await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(path)}`)).ok; }
  let pendingExistingFile = null;
  function closeExistingFileModal() { pendingExistingFile=null; document.querySelector('#existingFileModal').classList.add('hidden'); }
  function promptExistingFile(project, path, overwrite, skip) { pendingExistingFile={project,path,overwrite,skip}; document.querySelector('#existingFileMessage').textContent=`${path} 已存在。请选择如何处理。`; document.querySelector('#existingFileModal').classList.remove('hidden'); }
  async function viewExistingFile() { const pending=pendingExistingFile; if (!pending) return; try { const response=await fetch(`/api/file?project=${encodeURIComponent(pending.project.diskName)}&path=${encodeURIComponent(pending.path)}`), data=await response.json(); if (!response.ok) throw new Error(data.error || '无法读取文件'); const name=pending.path.split('/').pop(), group=groupForPath(pending.path); pending.project.paths[name]=pending.path; pending.project.content[name]=data.content; add(pending.project,group,name); closeExistingFileModal(); sync(pending.project,group); openFile(name); } catch (error) { showToast(`无法打开本地文件：${error.message}`); } }
  async function useExistingInitializationFile(project, expected, stage) {
    try {
      const response=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(expected)}`), data=await response.json();
      if (!response.ok) throw new Error(data.error || '无法读取文件');
      const name=expected.split('/').pop(), group=stage.output[0]?.[0]||'知识库';
      add(project,group,name); project.paths[name]=expected; project.content[name]=data.content;
      const flow=stages(project); project.initIndex+=1; if(project.initIndex>=flow.length)project.initialized=true;
      await saveWorkflowState(project);
      card(`已存在 ${name}。`, name, group);
      if(project.initialized)card('初始化已完成。现在可以新建章节。');
      sync(project); header(project); menu(project);
    } catch (error) { showToast(`读取已有文件失败：${error.message}`); }
  }
  async function persist(project, name, value, customPath='') {
    if (!project.diskName) return;
    const path = customPath || localPath(project, name);
    project.paths ||= {};
    project.paths[name] = path;
    try {
      const response = await fetch('/api/file', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project:project.diskName, path, content:value }) });
      if (!response.ok) throw new Error((await response.json()).error || '保存失败');
    } catch (error) { showToast(`本地保存失败：${error.message}`); }
  }
  function updateTokenSummary(project) {
    const el = document.querySelector('#tokenSummary');
    if (!el) return;
    const u = project.usage || {};
    el.textContent = `总输入 ${u.prompt_tokens||0} · 总输出 ${u.completion_tokens||0}`;
  }
  function normalizeUsage(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      prompt_tokens: Number(source.prompt_tokens) || 0,
      completion_tokens: Number(source.completion_tokens) || 0,
      total_tokens: Number(source.total_tokens) || 0,
      response_time: Number(source.response_time) || 0,
      calls: Number(source.calls) || 0
    };
  }
  async function loadUsageFromEntries(diskName, entries) {
    const usage = { prompt_tokens:0, completion_tokens:0, total_tokens:0, response_time:0, calls:0 };
    for (const entry of entries || []) {
      if (!entry.path.startsWith('运行记录/执行记录/') || !/\.jsonl$/i.test(entry.name)) continue;
      try {
        const response = await fetch(`/api/file?project=${encodeURIComponent(diskName)}&path=${encodeURIComponent(entry.path)}`);
        const data = await response.json();
        if (!response.ok || !data.content) continue;
        for (const line of String(data.content).split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            if (!record.success) continue;
            usage.prompt_tokens += Number(record.prompt_tokens) || 0;
            usage.completion_tokens += Number(record.completion_tokens) || 0;
            usage.total_tokens += Number(record.total_tokens) || 0;
            usage.response_time += Number(record.response_time) || 0;
            usage.calls += 1;
          } catch (_) {}
        }
      } catch (_) {}
    }
    return usage;
  }
  function addUsage(project, usage) {
    if (!usage) return;
    project.usage = project.usage || { prompt_tokens:0, completion_tokens:0, total_tokens:0, response_time:0, calls:0 };
    project.usage.prompt_tokens += usage.prompt_tokens || 0;
    project.usage.completion_tokens += usage.completion_tokens || 0;
    project.usage.total_tokens += usage.total_tokens || 0;
    project.usage.response_time += usage.response_time || 0;
    project.usage.calls += usage.calls || 0;
    updateTokenSummary(project);
  }
  let conversationSaveTimer;
  function saveConversation(project) { const snapshot=messages.cloneNode(true); snapshot.querySelectorAll('.generation-pending').forEach(node=>node.remove()); project.conversation=snapshot.innerHTML; return persist(project,'对话记录.md',project.conversation,'运行记录/对话记录.md'); }
  new MutationObserver(()=>{ const project=active(); if(!project)return; clearTimeout(conversationSaveTimer); conversationSaveTimer=setTimeout(()=>saveConversation(project),250); }).observe(messages,{childList:true,subtree:true,characterData:true});
  async function saveWorkflowState(project) {
    if (!project?.diskName) return;
    const state = {
      version: 1,
      initialized: Boolean(project.initialized),
      initIndex: Number(project.initIndex) || 0,
      sourceName: project.sourceName || '',
      introInput: project.introInput || '',
      introResult: project.introResult || null,
      chapterId: project.chapterId || null,
      chapters: (project.chapters || []).map(({name,index,checked,approved,displayName,anchorInput,chapterBrief,chapterBriefResult,chapterUserInfo}) => ({name,index,checked,approved,displayName,anchorInput,chapterBrief,chapterBriefResult,chapterUserInfo})),
      usage: project.usage ? normalizeUsage(project.usage) : undefined
    };
    await persist(project, 'workflow-state.json', JSON.stringify(state, null, 2), '运行记录/workflow-state.json');
  }
  function chapterNumber(name) { return name.match(/^第(\d+)章/)?.[1] || '未命名'; }
  async function saveDraft(project, item) {
    const source = `${item.name}.txt`, number = chapterNumber(item.name);
    const existing = Object.values(project.paths || {}).filter(path => path.startsWith(`草稿/第${number}章草稿`)).length;
    const draftName = `第${number}章草稿${existing + 1}.txt`;
    const draft = project.content[source] || fileState[source] || '';
    await persist(project, draftName, draft, `草稿/${draftName}`);
    showToast(`已另存为草稿/${draftName}`);
  }
  async function scoreProse(project, item) {
    try {
      const prosePath = project.paths?.[`${item.name}.txt`] || `正文/${item.name}.txt`;
      const response = await fetch('/api/score', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project:project.diskName, file:prosePath}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '评分失败');
      const number = chapterNumber(item.name), scoreName = `第${number}章评分.md`;
      const report = `# ${scoreName.replace('.md','')}\n\n> 由项目专用 SLOP 评分器生成；禁用词仅读取本小说的 \`词汇库/禁用词库.md\`。\n\n\`\`\`text\n${data.report}\n\`\`\``;
      project.content[scoreName] = report;
      await persist(project, scoreName, report, `评分/${scoreName}`);
      openFile(scoreName);
      showToast('评分完成，已保存评分报告');
    } catch (error) { showToast(`评分失败：${error.message}`); }
  }
  function sync(project, group = project.group) { Object.entries(files).forEach(([key, value]) => value.splice(0, value.length, ...project.files[key])); Object.keys(fileState).forEach(key => delete fileState[key]); Object.assign(fileState, project.content); openFiles=[]; currentFile=''; content.value=''; preview.innerHTML=''; path.textContent='当前文件 / 未选择'; renderTabs(); renderFiles(group); }
  function updateStepProgress(project, item) { const target=document.querySelector('#stepProgress'); if(!project.initialized){const flow=stages(project), completed=new Set(flow.slice(0,project.initIndex || 0).map(stage=>stage.id)); target.innerHTML=flow.filter(stage=>stage.id).map(stage=>`<span class="${completed.has(stage.id) ? 'done' : ''}">${stage.name}</span>`).join(''); return;} const enabled=chapterStages(), completed=new Set(item?.approved ? enabled.map(stage=>stage.id) : enabled.slice(0,item?.index || 0).map(stage=>stage.id)); const labels=[['compile_anchor','锚点'],['compile_config','配置'],['compile_dialogue','台词'],['generate_prose','正文'],['validate','校验报告']].filter(([id])=>enabled.some(stage=>stage.id===id)); target.innerHTML=labels.map(([id,label])=>`<span class="${completed.has(id) ? 'done' : ''}">${label}</span>`).join(''); }
  const chapterLabel = item => item?.displayName || item?.name || '未命名章节';
  function header(project) { let title='初始化', stage, target, next, item; if (!project.initialized) { const flow=stages(project), index=project.initIndex || 0; if(index===0){stage={id:'compile_intro',name:'小说资料'};target=project.introResult ? flow[0] : stage;next=project.introResult?'下一步：生成简介':'下一步：判别资料';}else{stage=flow[index-1] || {name:'初始化已完成'};target=flow[index] || null;next=target?`下一步：生成${target.name}`:'完成初始化';} } else if (!project.chapterId) { if (project.chapters?.length) project.chapterId = project.chapters[0].id; if (!project.chapterId) { title='准备新章节'; stage={name:'初始化已完成'}; target=stage; next='新建第1章'; } else { item=chapter(project); title=chapterLabel(item); stage=item.approved ? {name:'已通过'} : (chapterStages()[item.index] || {name:'本章已完成'}); target=stage; next=item.approved ? `新建第${project.chapters.length + 1}章` : item.checked ? '上一步' : `下一步：生成${stage.name}`; } } else { item=chapter(project); title=chapterLabel(item); stage=item.approved ? {name:'已通过'} : (chapterStages()[item.index] || {name:'本章已完成'}); target=stage; next=item.approved ? `新建第${project.chapters.length + 1}章` : item.checked ? '上一步' : `下一步：生成${stage.name}`; } document.querySelector('.eyebrow').textContent=`${project.name} /`; document.querySelector('.chat-title h1').textContent=title; const completedInit=!project.initialized && (project.initIndex || 0)>0; const completedChapter=project.initialized && item && item.index>0 && !item.approved ? (chapterStages()[item.index-1] || {name:'已生成'}).name : null; const initDone=project.initialized && !project.chapterId; const statusText=initDone ? '已生成' : completedInit ? `${stage.name} 已生成` : completedChapter ? `${completedChapter} 已生成` : `当前阶段：${stage.name}`; document.querySelector('.workflow').innerHTML=`<span class="status-dot"></span>${statusText}`; document.querySelector('#nextStep').innerHTML=`${next} <span>›</span>`; const prompt=document.querySelector('#prompt'); if(prompt)prompt.placeholder=stage?.id==='compile_intro'&&!project.introResult?'请输入所有与小说相关的信息：角色、背景、设定、剧情等…':stage?.id==='compile_anchor'?'请输入本章信息：已知出场角色 + 本章剧情梗概…':'可补充本步骤的创作信息；发送即生成当前阶段…'; setGenerationTarget(target?.name || '未选择'); updateStepProgress(project,item); document.querySelector('#stageSkip')?.remove(); if (target?.optional) { const skip=document.createElement('button'); skip.type='button'; skip.id='stageSkip'; skip.className='next-step'; skip.textContent=`跳过${target.name}`; skip.addEventListener('click',()=>!project.initialized ? runInitialization(project,true) : skipChapterStage(project)); document.querySelector('.composer-workflow').prepend(skip); } }
  function menu(project) { const picker=document.querySelector('#chapterPicker'), list=document.querySelector('#chapterMenu'); const label=!project.initialized?'初始化':project.chapterId?chapterLabel(chapter(project)):'准备新章节'; picker.childNodes[0].nodeValue=`${label} `; list.innerHTML=!project.initialized?'<button type="button" data-new-init>初始化</button><button type="button" class="create-chapter" data-new-chapter>＋ 新建章节</button>':`${project.chapters.map(item=>`<button type="button" data-new-chapter-id="${item.id}">${chapterLabel(item)}</button>`).join('')}<button type="button" class="create-chapter" data-new-chapter>＋ 新建章节</button>`; }
  function card(text, file, group, validation=false, draft=false, task='', retryPayload=null, retryComplete=false, files=[], kind='', usage=null) { const actions=validation?'<button type="button" data-new-action="undo">撤回</button><button type="button" data-new-action="retry">重试</button><button type="button" class="confirmed" data-new-action="pass">通过</button><button type="button" data-new-action="previous">上一步</button>':`<button type="button" data-new-action="undo">撤回</button><button type="button" data-new-action="retry">重试</button><button type="button" data-new-action="next">下一步</button>${draft?'<button type="button" data-new-action="draft">草稿</button><button type="button" data-new-action="score">评分</button>':''}`; const fileList=Array.isArray(file)?file:(file?[file]:[]); const fileButtons=fileList.map(f=>`<button class="generated-file" type="button" data-new-file="${f}" data-new-group="${group}"><span class="done-icon">✓</span> 已生成 <strong>${f}</strong><span class="open-arrow">打开 ›</span></button>`).join(''); const retryAttrs=task?` data-task="${task}" data-retry-input="${encodeURIComponent(JSON.stringify(retryPayload||{}))}" data-retry-complete="${retryComplete?'1':'0'}"`:''; const fileData=files.length?` data-files="${encodeURIComponent(JSON.stringify(files))}" data-kind="${kind}"`:''; const usageHtml=usage?`<div class="usage-line">模型：${usage.last?.model||''} · 输入 ${usage.prompt_tokens||0} · 输出 ${usage.completion_tokens||0} · 耗时 ${usage.response_time||0}s</div>`:''; clearPastStepActions(); messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message completion"${retryAttrs}${fileData}><div class="avatar">AI</div><div><p>${text}</p>${fileButtons}<div class="message-actions">${actions}</div>${usageHtml}</div></article>`); messages.scrollTop=messages.scrollHeight; return messages.lastElementChild; }
  async function applyGeneratedOutputs(project, task, input, complete, result) {
    addUsage(project, result.usage);
    await saveWorkflowState(project);
    const outputs = result.outputs || [];
    if (!outputs.length) throw new Error('流程脚本没有返回正式产物');
    const generatedFiles = [];
    for (const output of outputs) {
      const currentName = output.split('/').pop();
      if (/\.json$/i.test(currentName)) continue;
      const data = await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(output)}`).then(r=>r.ok?r.json():Promise.reject(new Error('无法读取产物')));
      const group = output.split('/')[0] || '知识库';
      add(project, group, currentName);
      project.paths[currentName] = output;
      project.content[currentName] = data.content;
      generatedFiles.push(currentName);
    }
    const displayFiles = generatedFiles.length ? generatedFiles : [outputs[0].split('/').pop()];
    const group = displayFiles[0] ? (project.paths[displayFiles[0]] || '').split('/')[0] || '知识库' : '知识库';
    card('已重新生成。', displayFiles, group, false, false, task, input, complete, outputs, 'retry', result.usage);
    sync(project);
  }
  function inferRetryFromCard(cardEl) {
    const btn = cardEl?.querySelector('[data-new-file]');
    if (!btn) return null;
    const rawName = btn.dataset.newFile || '', name = rawName.split(/[\\/]/).pop(), project = active(), path = project?.paths?.[name] || project?.paths?.[rawName] || rawName;
    if (name.startsWith('角色卡-') && name.endsWith('.md')) {
      const charName = name.slice(4, -3);
      return { task:'generate_character', input:{name:charName}, complete:true };
    }
    if (name.startsWith('关系卡-') && name.endsWith('.md')) {
      const inner = name.slice(4, -3), idx = inner.indexOf('-');
      if (idx > 0) return { task:'compile_relation', input:{character_a:inner.slice(0, idx).trim(), character_b:inner.slice(idx + 1).trim()}, complete:true };
    }
    const map = { '小说简介.md':'compile_intro', '世界观.md':'generate_worldview_json', '语言风格.md':'compile_style', '角色名单.md':'compile_character_roster', '剧情书.md':'compile_plot', '信息账本.md':'compile_ledger', '强制设定锚点.md':'compile_anchor', '台词.md':'compile_dialogue', '校验报告.md':'validate' };
    const task = map[name];
    if (task) {
      const input = {};
      if (task === 'compile_anchor' || task === 'compile_dialogue' || task === 'validate') {
        const m = path.match(/提示词\/([^/]+)\//);
        if (m) input.chapter = m[1];
      }
      if (task === 'compile_plot') input.kind = 'book';
      return { task, input, complete:false };
    }
    return null;
  }
  async function undoCompletion(completion) {
    const project = active();
    if (!project) return;
    const filesData = completion?.dataset.files;
    let paths = [];
    if (filesData) { try { paths = JSON.parse(decodeURIComponent(filesData)); } catch { paths = []; } }
    for (const path of paths) {
      try { await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(path)}`, { method:'DELETE' }); } catch (_) {}
      const name = path.split('/').pop();
      delete project.paths[name];
      delete project.content[name];
      const group = path.split('/')[0] || '知识库';
      const idx = (project.files[group] || []).indexOf(name);
      if (idx >= 0) project.files[group].splice(idx, 1);
    }
    const kind = completion?.dataset.kind;
    if (kind === 'init' && project.initIndex > 0) {
      project.initIndex -= 1;
      if (project.initIndex < (stages(project) || []).length) project.initialized = false;
    } else if (kind === 'chapter') {
      const item = chapter(project);
      if (item) { if (item.index > 0) item.index -= 1; item.checked = false; }
    }
    await saveWorkflowState(project);
    completion.remove();
    sync(project); header(project); menu(project);
    showToast('已撤回并删除生成文件');
  }
  function pendingCard(text) { clearPastStepActions(); messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message generation-pending"><div class="avatar">AI</div><div><p>${text}</p><div class="generation-progress" role="status" aria-label="正在执行"><i></i></div></div></article>`); messages.scrollTop=messages.scrollHeight; return messages.lastElementChild; }
  function finishPending(pending) { pending?.remove(); }
  function otherButton(name, count, handler, id='') { const button=document.createElement('button'); button.type='button'; button.className='project'; if(id)button.dataset.localProject=id; button.innerHTML=`<span class="project-dot"></span><span>${name}</span><span class="count">${String(count).padStart(2,'0')}</span>`; document.querySelector('.other-projects').after(button); button.addEventListener('click',handler); }
  function refreshProjectSidebar() { document.querySelectorAll('.other-projects ~ .project[data-local-project]').forEach(button=>button.remove()); [...projects.values()].filter(project=>project.id!==activeId).reverse().forEach(project=>otherButton(project.name,project.chapters.length,()=>activate(project.id),project.id)); }
  function localProjectButton(project) { let button=document.querySelector(`[data-local-project="${project.id}"]`); if(button)return button; button=document.querySelector('.current-project-row .project'); button.dataset.localProject=project.id; button.onclick=()=>activate(project.id); return button; }
  function activate(id) { const project=projects.get(id); if (!project) return; activeId=id; sessionStorage.setItem('novel:active-project',project.diskName); localProjectButton(project).classList.add('active'); document.querySelector('.current-project-row .project span:nth-child(2)').textContent=project.name; document.querySelector('.current-project-row .project .count').textContent=String(project.chapters.length).padStart(2,'0'); refreshProjectSidebar(); sync(project); header(project); menu(project); updateTokenSummary(project); }
  let pendingInitInput = null;
  const extractionSteps = new Set(['text_stats','word_frequency','style','positive_vocabulary','exclusive_vocabulary']);
  async function appendInitializationMaterial(project, text) { const value=text.trim(); if(!value)return; const previous=project.content['初始化资料.md'] || ''; const next=`${previous}${previous ? '\n\n## 用户补充\n' : '# 初始化资料\n\n'}${value}`; project.content['初始化资料.md']=next; await persist(project,'初始化资料.md',next,'运行记录/初始化资料.md'); }
  async function appendChapterUserInfo(project, item, text, initial=false) { const value=text.trim(); if(!value)return; const previous=item.chapterUserInfo || ''; const next=initial ? `# ${item.name} 用户信息\n\n## 初始用户信息\n${value}` : `${previous || `# ${item.name} 用户信息`}\n\n## 用户补充\n${value}`; item.chapterUserInfo=next; item.chapterBrief=value; await persist(project,`章节输入-${item.name}.md`,next,`运行记录/章节输入/${item.name}.md`); }
  function openInitInput(project, stage) { const spec=initInputSpec[stage.id]; if(!spec)return runInitialization(project,false,{}); pendingInitInput={projectId:project.id,stageId:stage.id,spec}; document.querySelector('#initInputTitle').textContent=spec.title; document.querySelector('#initInputNote').textContent=spec.note; document.querySelector('#initInputFields').innerHTML=spec.fields.map(field=>`<label>${field.label}${field.multiline ? `<textarea name="${field.name}" ${field.required?'required':''} placeholder="${field.placeholder||''}"></textarea>` : `<input name="${field.name}" ${field.required?'required':''} placeholder="${field.placeholder||''}" />`}</label>`).join(''); document.querySelector('#initInputModal').classList.remove('hidden'); document.querySelector('#initInputFields input, #initInputFields textarea')?.focus(); }
  async function assessProjectBrief(project) { const input=document.querySelector('#prompt'), brief=input.value.trim(); if(!brief){showToast('请输入小说相关信息');input.focus();return false;} try { showToast('正在判别小说资料…'); const response=await fetch('/api/project-brief/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:project.diskName,content:brief})}), result=await response.json(); if(!response.ok)throw new Error(result.error||'判别失败'); if(result.missing?.length){const labels={character:'补充主角信息',synopsis:'补充剧情梗概'};showToast(result.missing.map(key=>labels[key]).filter(Boolean).join(' / '),6000);input.focus();return false;} project.introInput=brief; project.introResult=result; project.content['初始化资料.md']='# 初始化资料\n\n## 初始用户信息\n'+brief; await persist(project,'初始化资料.md',project.content['初始化资料.md'],'运行记录/初始化资料.md'); await saveWorkflowState(project); input.value='';autoGrowComposer(); card('小说资料已确认，可生成正式简介与标签。'); header(project); return true; } catch(error) { recordWorkflowFailure('compile_intro','小说资料判别',error);showToast(`小说资料判别失败：${error.message}`,6000);return false; } }
  async function runInitialization(project, skipped=false, structuredInput=null, supplement='', force=false) { const flow=stages(project), stage=flow[project.initIndex]; if (!stage) { project.initialized=true; await saveWorkflowState(project); card('初始化已完成。现在可以新建章节。'); header(project); menu(project); return; } if (skipped) { project.initIndex+=1; await saveWorkflowState(project); card(`已跳过${stage.name}。`); sync(project); header(project); menu(project); return; } if (!stage.id) { project.initIndex+=1; await saveWorkflowState(project); return runInitialization(project); } if(stage.id==='compile_intro'&&!structuredInput){if(!project.introResult)return assessProjectBrief(project);structuredInput={summary:project.introResult.summary,tags:project.introResult.tags};} if(extractionSteps.has(stage.id)&&!structuredInput){if(!project.sourceName){showToast('同人项目缺少已上传的原著文件');return;}structuredInput={source:project.sourceName};} if(supplement)await appendInitializationMaterial(project,supplement); if (initInputSpec[stage.id] && !structuredInput) return openInitInput(project,stage); if (stage.id === 'generate_characters_batch') { try { const rosterResponse=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent('知识库/角色名单.json')}`), rosterData=await rosterResponse.json(); if(!rosterResponse.ok || !rosterData.content) throw new Error('角色名单不存在'); const roster=JSON.parse(rosterData.content), characters=roster.characters||[]; if(!characters.length) throw new Error('角色名单为空'); for(const ch of characters){ const chName=String(ch?.name||'').trim(); if(!chName) continue; const payload={name:chName}; if(ch?.brief) payload.brief=ch.brief; const result=await window.novelWorkflow.run('generate_character', payload, true); addUsage(project, result.usage); const output=result.outputs?.[0]; if(!output) throw new Error(`角色卡 ${chName} 生成失败`); const file=output.split('/').pop(), data=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(output)}`).then(r=>r.ok?r.json():Promise.reject(new Error('无法读取角色卡'))); add(project,'知识库',file); project.paths[file]=output; project.content[file]=data.content; card(`角色卡 ${chName} 已生成。`, file, '知识库', false, false, 'generate_character', payload, true, result.outputs, 'init', result.usage); } const retryIndex=project.initIndex; lastRetry = () => { project.initIndex = retryIndex; return runInitialization(project, false, structuredInput, '', true); }; project.initIndex+=1; if(project.initIndex>=flow.length)project.initialized=true; await saveWorkflowState(project); if(project.initialized)card('初始化已完成。现在可以新建章节。'); sync(project); header(project); menu(project); maybeAutoContinue(project); return; } catch(error) { recordWorkflowFailure(stage.id,stage.name,error); showToast(`${workflowFailureTitle(error)}：详情已保留在对话中`,5000); return; } }  const input=structuredInput || {user_supplement:project.content['初始化资料.md'] || ''}, expected=initOutputPath(stage,input); if(!force && expected && await localFileExists(project,expected)) return promptExistingFile(project,expected,()=>runInitialization(project,false,structuredInput,'',true),()=>useExistingInitializationFile(project, expected, stage)); try { const result=await window.novelWorkflow.run(stage.id,input,Boolean(structuredInput)), outputs=result.outputs||[]; addUsage(project, result.usage); if(!outputs.length)throw new Error('流程脚本没有返回正式产物'); const group=stage.output[0]?.[0]||'知识库'; const isHiddenJson=name=>name.toLowerCase().endsWith('.json'); const generatedFiles=[]; let name=''; for(const output of outputs){ const currentName=output.split('/').pop(), data=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(output)}`).then(response=>response.ok?response.json():Promise.reject(new Error('无法读取脚本产物'))); if(isHiddenJson(currentName)){ project.paths[currentName]=output; project.content[currentName]=data.content; continue; } add(project,group,currentName); project.paths[currentName]=output; project.content[currentName]=data.content; generatedFiles.push(currentName); if(!name)name=currentName; } if(!name)name=outputs[0].split('/').pop(); const displayFiles=generatedFiles.length?generatedFiles:[name]; const retryIndex=project.initIndex; lastRetry = () => { project.initIndex = retryIndex; return runInitialization(project, false, structuredInput, '', true); }; project.initIndex+=1; if(project.initIndex>=flow.length)project.initialized=true; await saveWorkflowState(project); card(`${stage.name}已由流程脚本生成。${generatedFiles.length>1?`（${generatedFiles.length} 个文件）`:''}`,displayFiles,group,false,false,stage.id,input,Boolean(structuredInput),outputs,'init',result.usage); if(project.initialized)card('初始化已完成。现在可以新建章节。'); sync(project);header(project);menu(project);maybeAutoContinue(project);document.querySelector('#prompt').value='';autoGrowComposer(); } catch(error) { if (error?.usage) addUsage(project, error.usage); recordWorkflowFailure(stage.id,stage.name,error); showToast(`${workflowFailureTitle(error)}：详情已保留在对话中`,5000); } }
  async function skipChapterStage(project) { const item=chapter(project), stage=chapterStages()[item?.index]; if (!item || !stage?.optional) return; item.checked=true; item.approved=true; await saveWorkflowState(project); card(`已跳过${stage.name}。本章已标记完成。`); sync(project, '正文'); header(project); menu(project); }
  async function skipExistingChapterFile(project) { const item=chapter(project), flow=chapterStages(), stage=flow[item?.index]; if (!item || !stage) return; if(item.index<flow.length-1)item.index+=1;else item.checked=true; await saveWorkflowState(project); card(`已跳过${stage.name}。`); sync(project,stage.group); header(project); menu(project); }
  async function runChapter(project, input={}, force=false) { const item=chapter(project), flow=chapterStages(), stage=flow[item.index]; if (!stage) { item.checked=true; item.approved=true; await saveWorkflowState(project); return header(project); } const expected=chapterOutputPath(item,stage); if(!force && expected && await localFileExists(project,expected)) return promptExistingFile(project,expected,()=>runChapter(project,input,true),()=>skipExistingChapterFile(project)); try { const payload={chapter:item.name,user_supplement:item.chapterUserInfo || item.chapterBrief || '',...input}; const result=await window.novelWorkflow.run(stage.id,payload,stage.id==='compile_anchor'); addUsage(project, result.usage); const output=result.outputs?.[0]; if(!output)throw new Error('流程脚本没有返回正式产物'); const file=output.split('/').pop(), data=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(output)}`).then(response=>response.ok?response.json():Promise.reject(new Error('无法读取脚本产物'))); add(project,stage.group,file); project.paths[file]=output; project.content[file]=data.content; if(stage.id==='compile_anchor')item.anchorInput=payload; const retryIndex=item.index; lastRetry = () => { item.index = retryIndex; return runChapter(project, input, true); }; if(item.index<flow.length-1)item.index+=1;else item.checked=true; await saveWorkflowState(project); card(`${stage.name}已由流程脚本生成。`,file,stage.group,item.index===flow.length-1,stage.name==='正文',stage.id,payload,stage.id==='compile_anchor',result.outputs,'chapter',result.usage); sync(project,stage.group);header(project);menu(project);maybeAutoContinue(project); } catch(error) { if (error?.usage) addUsage(project, error.usage); recordWorkflowFailure(stage.id,stage.name,error); showToast(`${workflowFailureTitle(error)}：详情已保留在对话中`,5000); } }
  async function assessChapterBrief(project) { const item=chapter(project), input=document.querySelector('#prompt'), brief=input.value.trim(); if(!brief){showToast('请输入本章信息');input.focus();return false;} try { showToast('正在判别本章信息…'); const response=await fetch('/api/chapter-brief/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:project.diskName,chapter:item.name,content:brief})}), result=await response.json(); if(!response.ok)throw new Error(result.error||'判别失败'); if(result.missing?.length){const labels={known_character:'补充信息卡',synopsis:'补充剧情梗概'}; showToast(result.missing.map(key=>labels[key]).filter(Boolean).join(' / '),6000);input.focus();return false;} await appendChapterUserInfo(project,item,brief,true); item.chapterBriefResult=result; await saveWorkflowState(project); input.value='';autoGrowComposer(); card('本章信息已确认，可进入锚点生成。'); header(project); return true; } catch(error) { recordWorkflowFailure('compile_anchor','章节信息判别',error); showToast(`章节信息判别失败：${error.message}`,6000); return false; } }
  function openChapter(project) { if(!project.initialized)return showToast('请先完成初始化，再新建章节');const n=project.chapters.length+1, modal=document.querySelector('#chapterModal');modal.dataset.volume='';document.querySelector('#chapterModal .modal-title strong').textContent=`新建第${n}章`;document.querySelector('#chapterModal .form-note').textContent=`将创建第${n}章，并从“锚点”开始生成。`;document.querySelector('#chapterName').placeholder=`例如：第${n}章：退婚`;modal.classList.remove('hidden');document.querySelector('#chapterName').focus(); }
  document.querySelector('#initInputForm').addEventListener('submit',event=>{ event.preventDefault(); const pending=pendingInitInput, project=pending&&projects.get(pending.projectId); if(!pending||!project||project.initIndex===undefined)return; const data={...(pending.spec.defaults||{})}; for(const field of pending.spec.fields){const value=event.target.elements[field.name]?.value.trim();if(field.required&&!value)return; if(value)data[field.name]=value;} pendingInitInput=null; document.querySelector('#initInputModal').classList.add('hidden'); runInitialization(project,false,data); });
  document.querySelector('[data-close-existing-file]').addEventListener('click',closeExistingFileModal);
  document.querySelector('#viewExistingFile').addEventListener('click',viewExistingFile);
  document.querySelector('#overwriteExistingFile').addEventListener('click',()=>{const pending=pendingExistingFile;closeExistingFileModal();pending?.overwrite();});
  document.querySelector('#skipExistingFile').addEventListener('click',()=>{const pending=pendingExistingFile;closeExistingFileModal();pending?.skip();});
  projectForm.addEventListener('submit',async event=>{const name=document.querySelector('#projectName').value.trim(),type=document.querySelector('input[name="projectType"]:checked').value,source=document.querySelector('#sourceFile')?.files?.[0];if(!name||(type==='同人'&&!source))return;event.preventDefault();event.stopImmediatePropagation();let saved;try{const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,type,defaultAssets:window.novelSettings?.defaultAssets?.()||[]})});saved=await response.json();if(!response.ok)throw new Error(saved.error||'创建失败');if(source){const sourceData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取原著文件'));reader.readAsDataURL(source);});const upload=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:saved.project,name:source.name,data:sourceData})});if(!upload.ok)throw new Error((await upload.json()).error||'原著上传失败');}}catch(error){if(saved?.project)fetch(`/api/projects/${encodeURIComponent(saved.project)}`,{method:'DELETE'}).catch(()=>{});showToast(`本地项目创建失败：${error.message}`);return;}const project={id:crypto.randomUUID(),name:saved.project,type,initialized:false,initIndex:0,sourceName:source?.name||'',files:blankFiles(),content:{},paths:{},diskName:saved.project,chapters:[],chapterId:null,group:type==='同人'?'提取':'知识库',usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,response_time:0,calls:0}};projects.set(project.id,project);await saveWorkflowState(project);localProjectButton(project);document.querySelector('#projectModal').classList.add('hidden');event.target.reset();messages.innerHTML=`<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${project.name}，并保存到本地小说项目文件夹。请先完成初始化，再新建章节。</p></div></article>`;activate(project.id);},true);
  async function executeCurrentChapter(project, supplement='') { const item=chapter(project),stage=item&&chapterStages()[item.index]; if(!item||!stage)return; if(stage.id==='compile_anchor'){const wasAssessed=Boolean(item.chapterBriefResult);if(!wasAssessed && !(await assessChapterBrief(project)))return;if(wasAssessed&&supplement)await appendChapterUserInfo(project,item,supplement);const result=item.chapterBriefResult;return runChapter(project,{characters:result.characters,core_event:result.core_event,information_boundary:'',foreshadowing:'',hook:''});} if(supplement)await appendChapterUserInfo(project,item,supplement); return runChapter(project); }
  const globalAssetTaskByFile = {
    '小说简介.md':'compile_intro',
    '世界观.md':'generate_worldview_json',
    '语言风格.md':'compile_style',
    '角色名单.md':'compile_character_roster',
    '角色卡':'generate_characters_batch',
    '关系卡':'generate_relations_batch',
    '信息账本.md':'compile_ledger',
    '剧情书.md':'compile_plot'
  };
  async function runGlobalAsset(project, task, naturalInput) {
    try {
      const result=await window.novelWorkflow.run(task, naturalInput, false);
      addUsage(project, result.usage);
      const outputs=result.outputs||[];
      if(!outputs.length) throw new Error('流程脚本没有返回正式产物');
      for(const output of outputs){
        const currentName=output.split('/').pop();
        if(/\.json$/i.test(currentName)) continue;
        const data=await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(output)}`).then(r=>r.ok?r.json():Promise.reject(new Error('无法读取脚本产物')));
        const group=output.split('/')[0]||'知识库';
        add(project,group,currentName);
        project.paths[currentName]=output;
        project.content[currentName]=data.content;
      }
      const displayFiles=outputs.filter(output=>!/\.json$/i.test(output)).map(output=>output.split('/').pop());
      const displayName=displayFiles[0]||outputs[0].split('/').pop();
      const group=project.paths[displayName]?.split('/')[0]||'知识库';
      card('已生成/更新。', displayFiles.length?displayFiles:[displayName], group, false, false, task, naturalInput, false, outputs, 'global', result.usage);
      await saveWorkflowState(project);
      sync(project); header(project); menu(project);
    } catch(error) {
      if(error?.usage) addUsage(project, error.usage);
      recordWorkflowFailure(task, task, error);
      showToast(`${workflowFailureTitle(error)}：详情已保留在对话中`,5000);
    }
  }
  function isAutoMode() { return document.querySelector('#writeModeLabel')?.textContent === '自动'; }
  function maybeAutoContinue(project) {
    if (!isAutoMode()) return;
    const current=active();
    if (!current || current.id !== project.id) return;
    setTimeout(() => {
      const latest=active();
      if (!latest || latest.id !== project.id) return;
      if (!latest.initialized) {
        const flow=stages(latest);
        if ((latest.initIndex||0) < flow.length) runInitialization(latest);
      } else {
        const item=chapter(latest);
        if (item && !item.checked && !item.approved) executeCurrentChapter(latest);
      }
    }, 350);
  }
  document.querySelector('#nextStep').addEventListener('click',async event=>{const project=active();event.preventDefault();event.stopImmediatePropagation();if(!project){document.querySelector('#newProject').click();return;}if(!project.initialized){const ns=stages(project)[project.initIndex]; if(ns) setGenerationTarget(ns.name); return runInitialization(project);}if(!project.chapterId||chapter(project).approved)return openChapter(project);const item=chapter(project);if(item.checked){item.index=Math.max(0,item.index-1);item.checked=false;saveWorkflowState(project);header(project);return;}const ns=chapterStages()[item.index]; if(ns) setGenerationTarget(ns.name); return executeCurrentChapter(project);},true);
  document.querySelector('#chapterMenu').addEventListener('click',event=>{const project=active(),button=event.target.closest('button');if(!project||!button)return;if(button.dataset.newChapter!==undefined){event.preventDefault();event.stopImmediatePropagation();openChapter(project);}if(button.dataset.newChapterId){event.preventDefault();event.stopImmediatePropagation();project.chapterId=button.dataset.newChapterId;sync(project);header(project);menu(project);}if(button.dataset.newInit!==undefined){event.preventDefault();event.stopImmediatePropagation();showToast('请完成初始化流程');}},true);
  document.querySelector('#chapterForm').addEventListener('submit',async event=>{const project=active(),name=document.querySelector('#chapterName').value.trim(),modal=document.querySelector('#chapterModal');if(!project||!name)return;event.preventDefault();event.stopImmediatePropagation();const n=project.chapters.length+1,fullName=/^第\d+章[：:]/.test(name)?name:`第${n}章：${name}`,volume=modal.dataset.volume||'',item={id:crypto.randomUUID(),name:fullName,index:0,checked:false,approved:false};if(volume){await persist(project,`${fullName}.txt`,`# ${fullName}\n\n`,`正文/${volume}/${fullName}.txt`);add(project,'正文',`${fullName}.txt`);}project.chapters.push(item);project.chapterId=item.id;await saveWorkflowState(project);modal.classList.add('hidden');modal.dataset.volume='';event.target.reset();messages.innerHTML=`<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${fullName}。请从本章锚点开始。</p></div></article>`;sync(project,'提示词');header(project);menu(project);if(volume)document.dispatchEvent(new CustomEvent('novel:project-switched',{detail:{chapterFile:`${fullName}.txt`}}));},true);
  document.querySelector('#composer').addEventListener('submit',async event=>{const project=active();if(!project)return;event.preventDefault();event.stopImmediatePropagation();const supplement=document.querySelector('#prompt').value.trim();if(supplement)appendUserMessage(supplement);const targetFile=document.querySelector('#generationContext').dataset.file;const globalTask=targetFile?globalAssetTaskByFile[targetFile]:null;if(globalTask){if(!supplement){showToast('请填写该模块的生成/更新要求');return;}const promptInput=document.querySelector('#prompt');promptInput.value='';autoGrowComposer();return runGlobalAsset(project,globalTask,supplement);}if(!project.initialized)return runInitialization(project,false,null,supplement);if(!project.chapterId||chapter(project).approved)return showToast('请先新建章节');return executeCurrentChapter(project,supplement);},true);
  messages.addEventListener('click',event=>{const project=active(),action=event.target.closest('[data-new-action]'),file=event.target.closest('[data-new-file]');if(!project||(!action&&!file))return;event.preventDefault();event.stopImmediatePropagation();if(file){sync(project,file.dataset.newGroup);openFile(file.dataset.newFile);return;}const item=chapter(project),type=action.dataset.newAction;if(type==='undo'){undoCompletion(action.closest('.completion')).catch(error=>showToast(`撤回失败：${error.message}`));}if(type==='retry'){ const completion=action.closest('.completion'), task=completion?.dataset.task; if(task){ let input={}; try{ input=JSON.parse(decodeURIComponent(completion.dataset.retryInput||'{}')); }catch{} const complete=completion.dataset.retryComplete==='1'; showToast('正在重新生成…'); window.novelWorkflow.run(task,input,complete).then(result=>applyGeneratedOutputs(project,task,input,complete,result)).catch(error=>showToast(`重试失败：${error.message}`)); } else { const inferred=typeof inferRetryFromCard==='function'?inferRetryFromCard(completion):null; if(inferred){ showToast('正在重新生成…'); window.novelWorkflow.run(inferred.task,inferred.input,inferred.complete).then(result=>applyGeneratedOutputs(project,inferred.task,inferred.input,inferred.complete,result)).catch(error=>showToast(`重试失败：${error.message}`)); } else { showToast('无法识别要重试的任务，请重新生成该步骤'); } } }if(type==='next')document.querySelector('#nextStep').click();if(type==='draft')saveDraft(project,item);if(type==='score')scoreProse(project,item);if(type==='previous'){item.index=Math.max(0,item.index-1);item.checked=false;saveWorkflowState(project);header(project);}if(type==='pass'){item.approved=true;saveWorkflowState(project);card('验收已通过：已更新剧情卷、世界观、语言风格、角色卡、关系卡与信息账本。');header(project);menu(project);}},true);
  document.addEventListener('novel:file-saved', event => { const project=active(); if (!project) return; const { name, value }=event.detail; project.content[name]=value; persist(project,name,value); });
  /* 启动恢复：仅把磁盘数据填入已有状态机，保留所有原有交互。 */
  async function performRestoreLocalProjects() {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (!response.ok || !data.projects?.length) { projects.clear(); activeId=null; Object.values(files).forEach(list=>list.splice(0)); Object.keys(fileState).forEach(name=>delete fileState[name]); document.querySelectorAll('.other-projects ~ .project').forEach(button=>button.remove()); document.querySelector('.current-project-row .project span:nth-child(2)').textContent='未选择小说'; document.querySelector('.current-project-row .project .count').textContent='00'; document.querySelector('.eyebrow').textContent='小说工作台 /'; document.querySelector('.chat-title h1').textContent='新建小说'; document.querySelector('.workflow').innerHTML='<span class="status-dot"></span>当前阶段：等待创建'; document.querySelector('#nextStep').innerHTML='新建小说 <span>›</span>'; document.querySelector('#chapterPicker').childNodes[0].nodeValue='新建小说 '; document.querySelector('#chapterMenu').innerHTML='<button type="button" class="create-chapter" data-new-chapter>＋ 新建小说</button>'; messages.innerHTML='<article class="message assistant-message"><div class="avatar">AI</div><div><p>还没有本地小说。请从左侧新建小说开始。</p></div></article>'; sync({files:blankFiles(),content:{},group:'正文'}); return; }
      const preferred = sessionStorage.getItem('novel:active-project');
      const projectName = data.projects.includes(preferred) ? preferred : data.projects[0];
      const treeResponse = await fetch(`/api/projects/${encodeURIComponent(projectName)}/tree`);
      const treeData = await treeResponse.json();
      if (!treeResponse.ok) throw new Error(treeData.error || '无法读取项目目录');
      const type=projectName.startsWith('同人-')?'同人':'原创';
      let savedState=null;
      try { const stateResponse=await fetch(`/api/file?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent('运行记录/workflow-state.json')}`); if(stateResponse.ok) savedState=JSON.parse((await stateResponse.json()).content); } catch (_) { savedState=null; }
      const project = { id:crypto.randomUUID(), name:projectName, type, initialized:false, initIndex:0, sourceName:savedState?.sourceName||'', introInput:savedState?.introInput||'', introResult:savedState?.introResult||null, files:blankFiles(), content:{}, paths:{}, diskName:projectName, chapters:[], chapterId:null, group:'正文', usage:normalizeUsage(savedState?.usage) };
      try { const conversationResponse=await fetch(`/api/file?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent('运行记录/对话记录.md')}`); if(conversationResponse.ok)project.conversation=(await conversationResponse.json()).content; } catch (_) { project.conversation=''; }
      const entries = [];
      const walk = (nodes, group='') => nodes.forEach(node => node.type === 'file' ? entries.push({ ...node, group }) : walk(node.children || [], group || node.name));
      walk(treeData.tree);
      if (!(project.usage.calls || project.usage.prompt_tokens || project.usage.completion_tokens)) {
        project.usage = await loadUsageFromEntries(projectName, entries);
      }
      if (!project.sourceName) { const sourceRoot=treeData.tree.find(node=>node.name==='原著'); project.sourceName=(sourceRoot?.children||[]).find(node=>node.type==='file')?.name||''; }
      for (const entry of entries) {
        if (!project.files[entry.group] || !/\.(md|txt|json|ya?ml)$/i.test(entry.name)) continue;
        if (/\.json$/i.test(entry.name)) continue;
        add(project, entry.group, entry.name);
        project.paths[entry.name] = entry.path;
        const fileResponse = await fetch(`/api/file?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(entry.path)}`);
        const fileData = await fileResponse.json();
        if (fileResponse.ok) project.content[entry.name] = fileData.content;
      }
      const initializationInput = entries.find(entry=>entry.path==='运行记录/初始化资料.md');
      if (initializationInput) {
        const inputResponse=await fetch(`/api/file?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(initializationInput.path)}`), inputData=await inputResponse.json();
        if(inputResponse.ok)project.content['初始化资料.md']=inputData.content;
      }
      const savedChapters=new Map((savedState?.chapters||[]).map(item=>[item.name,item]));
      const proseChapterNames = project.files['正文'].filter(name => /\.txt$/i.test(name)).map(name => name.replace(/\.txt$/i,''));
      if (proseChapterNames.length) {
        project.chapters = proseChapterNames.sort((a,b) => a.localeCompare(b,'zh-CN',{numeric:true})).map(name => ({ id:crypto.randomUUID(), name, index:0, checked:false, approved:false, ...(savedChapters.get(name)||{}) }));
      } else {
        project.chapters = (savedState?.chapters||[]).map(item => ({ id:crypto.randomUUID(), name:item.name, index:item.index||0, checked:!!item.checked, approved:!!item.approved, displayName:item.displayName||item.name, ...(savedChapters.get(item.name)||{}) }));
      }
      const flow=stages(project), hasInitialAsset=project.files['知识库'].includes('世界观.md') || project.files['知识库'].includes('世界观.json') || project.files['剧情'].includes('剧情书.md');
      project.initialized=savedState ? Boolean(savedState.initialized) : hasInitialAsset;
      project.initIndex=Math.min(Math.max(Number(savedState?.initIndex)||0,0),flow.length);
      if (!savedState && project.initialized) project.initIndex=flow.length;
      project.chapterId=project.chapters.find(item=>item.name===savedState?.chapterId)?.id || project.chapters[0]?.id || null;
      projects.clear();
      projects.set(project.id, project);
      document.querySelectorAll('.other-projects ~ .project').forEach(button=>button.remove());
      localProjectButton(project);
      activate(project.id);
      updateTokenSummary(project);
      messages.innerHTML=project.conversation || `<article class="message assistant-message"><div class="avatar">AI</div><div><p>已打开${project.name}。${project.initialized ? '可以新建章节，或从左侧选择已有章节。' : '请先完成初始化，再新建章节。'}</p></div></article>`;
      sessionStorage.setItem('novel:active-project', projectName);
      document.dispatchEvent(new CustomEvent('novel:project-switched'));
      data.projects.filter(name=>name!==projectName).reverse().forEach(name=>otherButton(name,0,()=>{ sessionStorage.setItem('novel:active-project',name); restoreLocalProjects(); }));
      if (project.chapterId) openFile(`${chapter(project).name}.txt`);
      showToast(`已从本地恢复 ${projectName}`);
    } catch (error) { showToast(`本地项目恢复失败：${error.message}`); }
  }
  function restoreLocalProjects() {
    const next=restoreQueue.catch(()=>{}).then(()=>performRestoreLocalProjects());
    restoreQueue=next;
    return next;
  }
  async function deleteCurrentChapter() {
    const project=active(), item=project && chapter(project);
    if (!project || !item) throw new Error('当前没有可删除的章节');
    const prosePath=project.paths?.[`${item.name}.txt`] || localPath(project, `${item.name}.txt`);
    await request(`/api/chapter?project=${encodeURIComponent(project.diskName)}&prosePath=${encodeURIComponent(prosePath)}`, {method:'DELETE'});
    project.chapters=project.chapters.filter(entry=>entry.id!==item.id);
    project.files['正文']=project.files['正文'].filter(name=>name!==`${item.name}.txt`);
    for (const [name,path] of Object.entries(project.paths || {})) if (path===prosePath || path.includes(`/${item.name}/`)) { delete project.paths[name]; delete project.content[name]; }
    project.chapterId=project.chapters[0]?.id || null;
    sync(project, '正文'); header(project); menu(project);
    messages.innerHTML=`<article class="message assistant-message"><div class="avatar">AI</div><div><p>已删除${item.name}及其本章记录。${project.chapterId ? '已切换到下一章。' : '请新建章节后继续。'}</p></div></article>`;
    setGenerationTarget(project.chapterId ? chapter(project).name : '新建章节', project.chapterId ? `${chapter(project).name}.txt` : '');
    if (project.chapterId) openFile(`${chapter(project).name}.txt`);
    document.dispatchEvent(new CustomEvent('novel:project-switched'));
    showToast(`已删除${item.name}`);
  }
  restoreLocalProjects();
  function selectChapterByFile(filename, useWorkflowMenu=true) { const project=active(), item=project?.chapters?.find(entry=>`${entry.name}.txt`===filename); if(!project||!item)return false; project.chapterId=item.id; header(project); if(useWorkflowMenu)menu(project); openFile(filename); return true; }
  function chapterDisplay(filename) { const item=active()?.chapters?.find(entry=>`${entry.name}.txt`===filename); return item?.displayName || filename; }
  window.novelLocal = { active, localPath, restoreLocalProjects, deleteCurrentChapter, selectChapterByFile, chapterDisplay };
  window.novelRetry = { run: () => lastRetry ? lastRetry() : null, fromCard: inferRetryFromCard };
})();

/* 工作台设置：界面偏好立即生效；模型、提示词和预设写入流程脚本配置。 */
(() => {
  const modal = document.querySelector('#settingsModal');
  const form = document.querySelector('#settingsForm');
  const widthOutput = document.querySelector('#sidebarWidthValue');
  const workspaceKey = 'novel:workspace-open';
  const allSteps = ['compile_intro','generate_worldview_json','compile_style','compile_character_roster','generate_characters_batch','generate_relations_batch','compile_plot','compile_volume','compile_ledger','compile_anchor','compile_config','compile_dialogue','compile_snapshot','generate_prose','validate'];
  const builtInProviders = [{name:'OpenAI',model:'gpt-5.6-terra',apiUrl:'https://api.openai.com/v1',apiKey:''},{name:'Anthropic（Claude）',model:'',apiUrl:'https://api.anthropic.com/v1',apiKey:''},{name:'deepseek',model:'deepseek-v4-pro',apiUrl:'https://api.deepseek.com',apiKey:''},{name:'Gemini',model:'gemini-3.7-flash',apiUrl:'https://generativelanguage.googleapis.com/v1beta/openai',apiKey:''},{name:'Kimi',model:'',apiUrl:'https://api.moonshot.cn/v1',apiKey:''},{name:'GLM',model:'',apiUrl:'https://open.bigmodel.cn/api/paas/v4',apiKey:''},{name:'MiniMax',model:'MiniMax-M3',apiUrl:'https://api.minimax.chat/v1',apiKey:''},{name:'硅基流动',model:'deepseek-ai/DeepSeek-V3.2',apiUrl:'https://api.siliconflow.cn/v1',apiKey:''},{name:'OpenCode',model:'',apiUrl:'',apiKey:''},{name:'Grok',model:'',apiUrl:'https://api.x.ai/v1',apiKey:''},{name:'自定义',model:'',apiUrl:'',apiKey:''}];
  const providerModels = {OpenAI:['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'],deepseek:['deepseek-v4-flash','deepseek-v4-pro'],Gemini:['gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-pro-preview'],MiniMax:['MiniMax-M3'],'硅基流动':['deepseek-ai/DeepSeek-V3.2','Pro/deepseek-ai/DeepSeek-V3.2']};
  const promptTemplates = { compile_intro:['小说简介','判别主角与剧情后生成不超过100字的简介，并自主补齐受控标签。'], generate_worldview_json:['世界观','根据题材与已有设定生成世界观；不得与已确认资产冲突。'], compile_style:['语言风格','把用户选择和已有文风整理为语言风格资产。'], compile_character_roster:['角色名单','整理并补全角色名单：每个角色包含姓名、简介和关系；没有名字的角色必须自动取名，取名避免俗套，少用月/清/雪/紫/璃等常见字。'], generate_characters_batch:['批量角色卡','根据角色名单批量生成多张结构化角色卡。'], generate_character:['角色卡','生成结构完整的角色卡，并与世界观和既有角色保持一致。'], compile_relation:['关系卡','生成双方称呼、关系、情感、经历和当前态度。'], compile_relation_roster:['关系名单','整理出本作的关系名单，每项包含两位角色和关系简述。'], generate_relations_batch:['批量关系卡','根据角色名单中的关系批量生成多张关系卡。'], compile_plot:['剧情书','生成剧情书或剧情卷，明确主线、关键角色与安排。'], compile_ledger:['信息账本','整理信息账本，记录已确认事实与状态。'], compile_anchor:['强制设定锚点','生成本章强制设定锚点，明确事件、边界、伏笔与钩子。'], compile_config:['配置','将本章叙事与结构选择整理为配置。'], compile_dialogue:['台词','生成台词：每行只能是 <角色名> + “<台词>” 或 <角色名> + “ [心声]”，禁止场景/动作/神态/旁白。'], compile_snapshot:['最终提示词快照','确定性汇总本章所需已确认上下文，冻结最终提示词快照。'], generate_prose:['正文','根据最终提示词快照生成正文，遵守锚点与信息边界。'], rewrite_prose:['改写正文','按用户要求改写正文，同时维持已确认事实。'], validate:['校验与验收','检查锚点、设定、角色、剧情和文风的一致性，给出结论。'], input_to_fields:['输入整理','把自然语言或未完成表单整理为当前步骤可用的结构化字段。'] };
  const contracts = {generate_worldview:'# 世界观\n\n## 小说类型\n- 题材：\n- 核心卖点：\n\n## 世界观基础\n- 时间与空间：\n- 社会秩序：\n- 核心矛盾：\n\n## 力量体系\n- 名称与来源：\n- 等级/境界：\n- 规则、代价与限制：\n\n## 势力\n每个势力均单独列出：\n### 势力：名称\n- 地位：\n- 位置：\n- 关键角色：姓名｜身份｜境界/能力\n- 目标与资源：\n\n## 资源设定\n- 资源名称｜用途｜获取规则｜稀缺性：',compile_style:'# 语言风格\n\n## 行文风格\n- 叙事节奏：\n- 叙事语调：\n- 描写风格：\n\n## 格式要求\n- 人称视角：\n- 句段长度：\n- 心理呈现：\n- 对话处理：\n- 标点习惯：\n\n## 手法偏好\n- 表现手法：\n- 描写角度：\n- 修辞：\n- 感官倾向：\n\n## 词汇策略\n- 术语/典故：\n- 语域：\n- 情绪密度：',generate_character:'# 角色卡：角色名\n\n- 重要性：1–4（1=路人，2=配角，3=重要配角，4=主角/核心）\n- 性别：\n- 年龄：\n- 身份：\n\n## 性格与价值观\n- 性格：\n- 价值观：\n- 核心目标与底线：\n\n## 外形与声音\n- 外貌：\n- 身材/服饰：\n- 音色与语言习惯：\n\n## 能力与境界\n- 能力/境界：\n- 代价、限制与弱点：\n\n## 经历时间轴\n| 时间 | 事件 | 对当前角色的影响 |\n| --- | --- | --- |\n| | | |',compile_relation:'# 关系卡：角色 A — 角色 B\n\n- 称呼：\n- 关系：\n- 情感：\n- 共同经历：\n- 当前态度：',compile_plot:'# 剧情书或剧情卷\n\n## 主角\n\n## 卷关键角色\n\n## 章号范围\n\n## 主线\n\n## 逐章剧情\n| 章号 | 标题/阶段 | 核心事件 | 冲突与转折 | 章末钩子 |\n| --- | --- | --- | --- | --- |\n| | | | | |',compile_ledger:'# 信息账本\n\n类型只能使用：历史、传闻、伏笔、已确认事实、待揭示信息。\n\n| 类型 | 内容 | 来源/章节 | 状态 |\n| --- | --- | --- | --- |\n| 历史/传闻/伏笔/已确认事实/待揭示信息 | | | 已确认/待验证/已回收 |',compile_anchor:'# 本章强制设定锚点\n\n## 角色锚点\n每位出场角色一条：角色名｜目的｜情绪｜本章行动边界\n\n## 核心事件\n- 必须在 100 个汉字以内：\n\n## 信息边界\n- 可揭示信息：\n- 不可揭示信息：\n- 揭示方式：\n- 揭示者：\n- 揭示位置：\n\n## 伏笔\n\n## 钩子',compile_config:'# 本章配置\n\n必须包含十个配置分组；未使用分组留空。',compile_dialogue:'# 本章台词\n\n每行格式：角色名：[心理或动作]“台词”\n\n只输出服务于本章锚点的台词。',compile_snapshot:'# 最终提示词快照\n\n必须汇总世界观、语言风格、角色卡、关系卡、锚点、配置、台词、禁词表、通用词库、章节大纲、上一章结尾。',generate_prose:'只输出完整正文，不要标题、解释或代码围栏；严格依据最终提示词快照、章节大纲和已确认事实。人物心理必须写为 [心理内容]；人物对白必须使用中文引号“”；每次场景切换必须单独使用一行 --- 分隔。',rewrite_prose:'只输出改写后的完整正文，不要标题、解释或代码围栏；保留本章既定事实。人物心理必须写为 [心理内容]；人物对白必须使用中文引号“”；每次场景切换必须单独使用一行 --- 分隔。',validate:'# 本章校验报告\n\n## 语义校验\n- 锚点落实：\n- 设定一致性：\n- 角色一致性：\n- 剧情与大纲：\n- 文风与表达：\n\n## 结论\n- 结果：通过 或 需修复\n- 问题清单：如需修复，请列出具体问题与修改建议'};
  promptTemplates.compile_volume = ['剧情卷 N','生成单卷剧情，明确卷名、章号范围与每章剧情。'];
  promptTemplates.compile_style[0] = '文风提示词（语言风格）';
  const promptGroups = [
    ['初始化提示词', ['compile_intro','generate_worldview_json','compile_style','compile_character_roster','generate_characters_batch','generate_relations_batch','compile_plot','compile_volume','compile_ledger']],
    ['章节提示词', ['compile_anchor','compile_config','compile_dialogue','compile_snapshot','generate_prose','validate']],
  ];
  const stylePromptAssets = [['language_style','语言风格'], ['person_vocab','人物词库'], ['dialogue_vocab','对话词库'], ['common_vocab','通用词库'], ['forbidden_vocab','禁用词库']];
  const promptOptions = () => promptGroups.map(([label, keys]) => `<optgroup label="${label}">${keys.map(key => `<option value="${key}">${promptTemplates[key][0]}</option>`).join('')}</optgroup>`).join('');
  const renderPromptColumns = selected => { document.querySelector('#promptColumns').innerHTML = `${promptGroups.map(([label, keys], index) => `<details ${index === 0 ? 'open' : ''}><summary>${label}</summary><div>${keys.map(key => `<button type="button" class="${key === selected ? 'active' : ''}" data-prompt-key="${key}">${promptTemplates[key][0]}</button>`).join('')}</div></details>`).join('')}<details><summary>文风提示词</summary><div>${stylePromptAssets.map(([id,name]) => `<button type="button" data-default-asset="${id}">${name}</button>`).join('')}</div></details>`; };
  contracts.generate_worldview = `# 世界观

## 小说类型

## 世界观基础

## 力量体系

## 势力
- 名称：
- 地位：
- 位置：
- 关键角色：角色名｜势力内身份｜境界/能力

## 资源设定`;
  contracts.generate_worldview_json = `输出严格结构化对象，不要 Markdown 标题，不要代码围栏。

字段结构：
{
  "novel_type": "小说类型/题材",
  "worldview_basis": "世界观基础",
  "power_system": "力量体系（字符串或对象）",
  "factions": [
    {
      "name": "势力名称",
      "status": "地位",
      "location": "位置",
      "key_characters": [
        { "name": "角色名", "role": "势力内身份", "ability": "境界/能力" }
      ]
    }
  ],
  "resources": ["资源名称或 {name, description} 对象"]
}`;
  contracts.compile_character_roster = `输出严格结构化对象，不要 Markdown 标题，不要代码围栏。

字段结构：
{
  "characters": [
    {
      "name": "角色名；若用户未提供名字，必须根据身份/描述自动取名；取名避免俗套，少用月/清/雪/紫/璃等常见字",
      "brief": "角色简介：身份、性格、目标等",
      "relations": [
        { "target": "关联角色名", "relationship": "关系描述（如夫妻、交易同盟、敌对）" }
      ]
    }
  ]
}`;
  contracts.generate_characters_batch = `读取 知识库/角色名单，为名单中的每个角色生成一张结构化角色卡。`;
  contracts.compile_relation_roster = `输出严格结构化对象，不要 Markdown 标题，不要代码围栏。

字段结构：
{
  "relations": [
    { "character_a": "角色A", "character_b": "角色B", "brief": "关系简述（可选）" }
  ]
}`;
  contracts.generate_relations_batch = `读取 知识库/关系名单，为名单中的每组关系生成一张结构化关系卡。`;
  contracts.compile_style = `# 语言风格

## 行文风格
- 叙事节奏：
- 语体色彩：
- 叙事语调：
- 描写风格：

## 格式要求
- 人称视角：
- 句段长度：
- 心理呈现：
- 对话处理：
- 标点习惯：

## 手法偏好
- 表达方式：
- 表现手法：
- 描写角度：
- 修辞手法：

## 词汇策略
- 称谓指代：
- 雅俗取向：
- 情绪浓度：
- 感官倾向：`;
  contracts.generate_character = `# 角色卡：角色名

- 性别｜重要性：1 路人 / 2 配角 / 3 重要 / 4 主角
- 身份｜性格｜价值观
- 外貌气质｜身材身高｜服饰偏好
- 语言习惯｜音色
- 主要能力 / 境界
- 女角色可选：称谓指代、外貌气质、身体部位、肌肤体香
- 年龄与经历时间轴`;
  contracts.compile_plot = `# 剧情书

- 主角：
- 第 N 卷：关键角色、剧情。`;
  contracts.compile_volume = `# 剧情卷 N

- 卷名：
- 章号范围：
- 第 X 章：剧情。`;
  contracts.compile_ledger = `# 信息账本

- 历史：
- 传闻：
- 伏笔：`;
  contracts.compile_anchor = `# 第 X 章强制设定锚点

- 出场角色：角色名（目的、情绪）
- 核心事件：不多于 100 字
- 信息边界：揭示方式、揭示者、揭示位置
- 伏笔
- 钩子`;
  contracts.compile_dialogue = `# 第 X 章台词

每行格式只有两种：
<角色名> + “<台词>”
<角色名> + “ [心声]”

禁止写场景、动作、神态、旁白或叙述。`;
  contracts.compile_snapshot = `# 最终提示词快照

- 世界观
- 语言风格
- 人物词库
- 对话词库
- 通用词库
- 本章涉及的角色卡与关系卡
- 本章强制设定锚点
- 本章配置
- 本章台词
- 禁词表
- 禁用词库（仅在新建小说时勾选复制后带入）
- 上一章结尾`;
  contracts.generate_prose = `输入：最终提示词快照。

- 心理活动：[]
- 对话：中文引号 “”
  - 场景转换：分隔线 ---`;
  // 章节流程没有“大纲”步骤；快照、正文与校验只依据已存在的锚点、配置和台词资产。
  contracts.compile_snapshot = contracts.compile_snapshot.replace('、章节大纲', '');
  contracts.generate_prose = contracts.generate_prose.replace('、章节大纲', '');
  contracts.validate = contracts.validate.replace('剧情与大纲', '剧情连贯性');
  const basePrompt = '你是小说工作台中的步骤生成器。根据用户字段和已确认项目上下文，生成一个最终 Markdown 文件。\n\n规则：\n1. 只输出最终 Markdown，不解释，不使用代码围栏。\n2. 必须严格遵循输出契约。\n3. 用户字段优先；项目上下文只可作为约束和补充依据。\n4. 不得编造与已有事实冲突的设定。\n5. 上下文没有依据时可使用“待补充”或审慎的创作补全。';
  const fullPrompt = key => settings.scriptPrompts?.[key] || `${basePrompt}\n\n当前步骤：${promptTemplates[key][0]}\n\n输出契约：\n${contracts[key] || '该步骤由参考生成脚本执行；正式产物须通过标题、必填区段和内容格式门禁。'}`;
  const scriptPromptText = document.querySelector('#scriptPromptText');
  const scriptPromptPreview = document.querySelector('#scriptPromptPreview');
  const defaultAssetNote = document.querySelector('#defaultAssetNote');
  let scriptPromptEditing = false;
  let activeDefaultAsset = null;
  function setScriptPromptMode(editing) {
    scriptPromptEditing = editing;
    scriptPromptText.classList.toggle('hidden', !editing);
    scriptPromptPreview.classList.toggle('hidden', editing);
    document.querySelector('#editScriptPrompt').classList.toggle('hidden', editing);
    document.querySelector('#saveScriptPrompt').classList.toggle('hidden', !editing);
    document.querySelector('#cancelScriptPrompt').classList.toggle('hidden', !editing);
    if (!editing) scriptPromptPreview.innerHTML = renderMarkdown(scriptPromptText.value);
  }
  function showScriptPrompt(key) { activeDefaultAsset=null; defaultAssetNote.classList.add('hidden'); document.querySelector('.script-model-row').classList.remove('hidden'); scriptPromptText.value = fullPrompt(key); if (!scriptPromptEditing) scriptPromptPreview.innerHTML = renderMarkdown(scriptPromptText.value); }
  async function showDefaultAsset(asset) { const response=await fetch(`/api/default-assets?asset=${encodeURIComponent(asset)}`), data=await response.json(); if(!response.ok) throw new Error(data.error||'读取默认资料失败'); activeDefaultAsset=asset; defaultAssetNote.classList.remove('hidden'); document.querySelector('.script-model-row').classList.add('hidden'); scriptPromptText.value=data.content; scriptPromptPreview.innerHTML=renderMarkdown(data.content); setScriptPromptMode(false); }
  const defaultAssetIds = ['language_style','person_vocab','dialogue_vocab','common_vocab','forbidden_vocab'];
  const defaults = { defaultMode:'标准', theme:'light', enterToSend:true, provider:'deepseek', model:'', apiUrl:'https://api.deepseek.com', providers:builtInProviders, scriptModels:{}, scriptPrompts:{}, enabledSteps:allSteps, defaultAssets:defaultAssetIds, sidebarOpen:true, sidebarWidth:36, openFilesInSidebar:true };
  let settings = {...defaults};
  const setSettingsModels = (providerName, current='') => { const known=providerModels[providerName]||[], options=[...new Set((known.length?known:[current]).filter(Boolean))]; form.model.innerHTML=options.length?options.map(item=>`<option value="${item}">${item}</option>`).join(''):'<option value="">请先获取最新模型</option>'; if(options.includes(current)) form.model.value=current; };
  const fillScriptModels = (providerName, current='') => { const scriptModel=document.querySelector('#scriptModelSelect'), known=providerModels[providerName]||[], provider=settings.providers.find(item=>item.name===providerName), options=[...new Set([current, ...known, provider?.model].filter(Boolean))]; scriptModel.innerHTML=options.length?options.map(item=>`<option value="${item}">${item}</option>`).join(''):'<option value="">请先获取最新模型</option>'; if(options.includes(current)) scriptModel.value=current; };
  const read = async () => { try { const response = await fetch('/api/settings'); const data = await response.json(); return response.ok ? {...defaults, ...data.settings} : {...defaults}; } catch { return {...defaults}; } };
  const setWorkspaceOpen = open => { document.querySelector('.app-shell').classList.toggle('workspace-closed', !open); sessionStorage.setItem(workspaceKey, String(open)); };
  const apply = value => {
    settings = {...defaults, ...value}; settings.providers = settings.providers?.length ? settings.providers : [...defaults.providers]; settings.scriptModels = settings.scriptModels && typeof settings.scriptModels === 'object' ? settings.scriptModels : {}; settings.scriptPrompts = settings.scriptPrompts && typeof settings.scriptPrompts === 'object' ? settings.scriptPrompts : {}; settings.enabledSteps = settings.enabledSteps?.length ? [...new Set(['compile_intro',...settings.enabledSteps.flatMap(step => step === 'generate_worldview' ? ['generate_worldview_json'] : step === 'generate_character' ? ['compile_character_roster','generate_characters_batch'] : step === 'compile_relation' ? [] : [step])])] : [...allSteps]; if (settings.enabledSteps.includes('compile_anchor')) settings.enabledSteps = [...new Set([...settings.enabledSteps, 'compile_config'])]; settings.defaultAssets = Array.isArray(settings.defaultAssets) ? settings.defaultAssets.filter(item=>defaultAssetIds.includes(item)) : [...defaultAssetIds];
    document.body.dataset.theme = settings.theme;
    document.querySelector('#writeModeLabel').textContent = settings.defaultMode;
    document.querySelectorAll('[data-write-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.writeMode === settings.defaultMode)));
    document.querySelector('.app-shell').style.setProperty('--workspace-width', `${settings.sidebarWidth}vw`);
    if (sessionStorage.getItem(workspaceKey) === null) setWorkspaceOpen(settings.sidebarOpen);
  };
  const fill = () => {
    form.defaultMode.value = settings.defaultMode; form.theme.value = settings.theme; form.enterToSend.checked = settings.enterToSend;
    form.provider.innerHTML = settings.providers.map(item => `<option value="${item.name}">${item.name}</option>`).join('');
    form.provider.value = settings.provider; const activeProvider=settings.providers.find(item => item.name === settings.provider), currentModel=settings.model || activeProvider?.model || ''; setSettingsModels(settings.provider,currentModel); form.apiUrl.value = settings.apiUrl || activeProvider?.apiUrl || ''; form.apiKey.value = activeProvider?.apiKey || '';
    form.sidebarOpen.checked = settings.sidebarOpen; form.sidebarWidth.value = settings.sidebarWidth; form.openFilesInSidebar.checked = settings.openFilesInSidebar; widthOutput.value = `${settings.sidebarWidth}%`; widthOutput.textContent = `${settings.sidebarWidth}%`; document.querySelectorAll('#flowOptions .flow-group input').forEach(input => input.checked = settings.enabledSteps.includes(input.value)); document.querySelectorAll('.flow-default input').forEach(input => input.checked = settings.defaultAssets.includes(input.value)); const promptSelect=document.querySelector('#scriptPromptSelect'), scriptProvider=document.querySelector('#scriptProviderSelect'), scriptModel=document.querySelector('#scriptModelSelect'), scriptThinking=document.querySelector('#scriptThinkingSelect'); promptSelect.innerHTML=Object.entries(promptTemplates).map(([key,[label]])=>`<option value="${key}">${label}</option>`).join(''); scriptProvider.innerHTML=settings.providers.map(item=>`<option value="${item.name}">${item.name}</option>`).join(''); promptSelect.value ||= 'generate_prose'; const scriptSetting=settings.scriptModels[promptSelect.value] || {}; scriptProvider.value=scriptSetting.provider || settings.provider; fillScriptModels(scriptProvider.value, scriptSetting.model || settings.providers.find(item=>item.name===scriptProvider.value)?.model || ''); scriptThinking.value=scriptSetting.thinking || 'medium'; showScriptPrompt(promptSelect.value); setScriptPromptMode(false);
  };
  const open = async () => { settings = await read(); apply(settings); fill(); const promptSelect=document.querySelector('#scriptPromptSelect'), selected=promptSelect.value; promptSelect.innerHTML=promptOptions(); promptSelect.value=selected || 'generate_worldview_json'; renderPromptColumns(promptSelect.value); modal.classList.remove('hidden'); };
  document.querySelector('#settings').addEventListener('click', open);
  document.querySelectorAll('[data-close-settings]').forEach(button => button.addEventListener('click', () => modal.classList.add('hidden')));
  document.querySelector('.settings-tabs').addEventListener('click', event => { const button = event.target.closest('[data-settings-tab]'); if (!button) return; document.querySelectorAll('[data-settings-tab]').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('[data-settings-section]').forEach(section => section.classList.toggle('hidden', section.dataset.settingsSection !== button.dataset.settingsTab)); });
  const selectPrompt = key => { const promptSelect=document.querySelector('#scriptPromptSelect'), configured=settings.scriptModels[key] || {}, provider=document.querySelector('#scriptProviderSelect'); promptSelect.value=key; provider.value=configured.provider || settings.provider; fillScriptModels(provider.value, configured.model || settings.providers.find(item=>item.name===provider.value)?.model || ''); document.querySelector('#scriptThinkingSelect').value=configured.thinking || 'medium'; showScriptPrompt(key); setScriptPromptMode(false); renderPromptColumns(key); };
  document.querySelector('#scriptPromptSelect').addEventListener('change', event => selectPrompt(event.target.value));
  document.querySelector('#promptColumns').addEventListener('click', event => { const button=event.target.closest('[data-prompt-key]'); if(button) return selectPrompt(button.dataset.promptKey); const asset=event.target.closest('[data-default-asset]'); if(asset) showDefaultAsset(asset.dataset.defaultAsset).catch(error=>showToast(error.message)); });
  document.querySelector('#editScriptPrompt').addEventListener('click', () => setScriptPromptMode(true));
  document.querySelector('#cancelScriptPrompt').addEventListener('click', () => { if(activeDefaultAsset) showDefaultAsset(activeDefaultAsset).catch(error=>showToast(error.message)); else showScriptPrompt(document.querySelector('#scriptPromptSelect').value); setScriptPromptMode(false); });
  document.querySelector('#saveScriptPrompt').addEventListener('click', async () => { if(activeDefaultAsset) { try { const response=await fetch('/api/default-assets',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset:activeDefaultAsset,content:scriptPromptText.value})}), data=await response.json(); if(!response.ok) throw new Error(data.error||'保存失败'); scriptPromptText.value=data.content; setScriptPromptMode(false); showToast('默认资料已保存，将用于以后新建的小说'); } catch(error) { showToast(`保存失败：${error.message}`); } return; } const key=document.querySelector('#scriptPromptSelect').value; settings.scriptPrompts[key]=scriptPromptText.value; setScriptPromptMode(false); form.requestSubmit(); });
  document.querySelector('#scriptProviderSelect').addEventListener('change', event => { const provider=settings.providers.find(item=>item.name===event.target.value); fillScriptModels(event.target.value, provider?.model || ''); });
  form.sidebarWidth.addEventListener('input', () => { widthOutput.value = `${form.sidebarWidth.value}%`; widthOutput.textContent = `${form.sidebarWidth.value}%`; });
  form.provider.addEventListener('change', () => { const provider = settings.providers.find(item => item.name === form.provider.value); if (provider) { setSettingsModels(provider.name,provider.model || ''); form.apiUrl.value = provider.apiUrl || ''; form.apiKey.value = provider.apiKey || ''; } });
  document.querySelector('#refreshSettingsModels').addEventListener('click', async () => { const button=document.querySelector('#refreshSettingsModels'); button.disabled=true; button.textContent='获取中…'; try { const response=await fetch('/api/providers/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:form.provider.value,apiUrl:form.apiUrl.value.trim(),apiKey:form.apiKey.value})}), data=await response.json(); if(!response.ok) throw new Error(data.error||'获取失败'); providerModels[form.provider.value]=data.models||[]; setSettingsModels(form.provider.value,form.model.value); showToast(`已获取 ${data.models.length} 个最新模型`); } catch(error) { showToast(error.message); } finally { button.disabled=false; button.textContent='获取最新模型'; } });
  document.querySelector('#addProvider').addEventListener('click', () => { const name = prompt('提供方名称（英文或中文均可）'); if (!name?.trim()) return; if (settings.providers.some(item => item.name === name.trim())) return showToast('该提供方已存在'); settings.providers.push({name:name.trim(), model:'', apiUrl:''}); form.provider.innerHTML = settings.providers.map(item => `<option value="${item.name}">${item.name}</option>`).join(''); form.provider.value = name.trim(); setSettingsModels(name.trim(),''); form.apiUrl.value = ''; });
  form.addEventListener('submit', async event => { event.preventDefault(); const errorNote=document.querySelector('#settingsSaveError'); errorNote.classList.add('hidden'); const provider = form.provider.value; const providers = settings.providers.map(item => item.name === provider ? {name:provider, model:form.model.value.trim(), apiUrl:form.apiUrl.value.trim(), apiKey:form.apiKey.value} : item); const enabledSteps = [...document.querySelectorAll('#flowOptions .flow-group input:checked')].map(input => input.value), defaultAssets=[...document.querySelectorAll('.flow-default input:checked')].map(input=>input.value), script = document.querySelector('#scriptPromptSelect').value, scriptModels = {...settings.scriptModels, [script]:{provider:document.querySelector('#scriptProviderSelect').value, model:document.querySelector('#scriptModelSelect').value, thinking:document.querySelector('#scriptThinkingSelect').value}}; const next = {...settings, defaultMode:form.defaultMode.value, theme:form.theme.value, enterToSend:form.enterToSend.checked, provider, model:form.model.value.trim(), apiUrl:form.apiUrl.value.trim(), providers, scriptModels, scriptPrompts:settings.scriptPrompts, enabledSteps, defaultAssets, sidebarOpen:form.sidebarOpen.checked, sidebarWidth:Number(form.sidebarWidth.value), openFilesInSidebar:form.openFilesInSidebar.checked}; try { const response = await fetch('/api/settings', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(next)}), raw=await response.text(); let data={}; try { data=raw?JSON.parse(raw):{}; } catch { throw new Error(`服务器返回了无法识别的内容（HTTP ${response.status}）`); } if (!response.ok) throw new Error(data.error || `服务器拒绝保存（HTTP ${response.status}）`); apply(data.settings); modal.classList.add('hidden'); showToast('设置已保存并生效'); } catch (error) { const detail=error?.message || '浏览器未返回具体错误'; errorNote.textContent=`保存失败详情：${detail}`; errorNote.classList.remove('hidden'); showToast(`设置保存失败：${detail}`, 8000); } });
  document.querySelector('#prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && settings.enterToSend) { event.preventDefault(); document.querySelector('#composer').requestSubmit(); } });
  window.novelSettings = {
    openWorkspaceForFile: () => { if (settings.openFilesInSidebar) setWorkspaceOpen(true); },
    setWorkspaceOpen,
    isStepEnabled: step => settings.enabledSteps.includes(step),
    defaultAssets: () => [...settings.defaultAssets],
    setDefaultMode: async mode => {
      const next={...settings, defaultMode:['手动','标准','自动'].includes(mode) ? mode : '标准'};
      try {
        const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error||'保存失败');
        settings=data.settings; apply(settings);
        showToast(`已切换为${settings.defaultMode}模式`);
      } catch(error) { showToast(`模式切换失败：${error.message}`); }
    }
  };
  read().then(apply);
})();

/* 主控对话栏：当前模型、提供方与思考强度。保存后统一用于已启用的流程步骤。 */
(() => {
  const button=document.querySelector('#modelControlButton'), menu=document.querySelector('#modelControlMenu'), label=document.querySelector('#modelControlLabel'), providerText=document.querySelector('#quickProviderText'), model=document.querySelector('#quickModelSelect'), apiUrl=document.querySelector('#quickApiUrl'), thinking=document.querySelector('#quickThinkingSelect'), actions=menu.querySelector('.model-control-actions'), configuredList=Object.assign(document.createElement('div'),{className:'configured-model-list hidden'}); menu.append(configuredList);
  let settings={};
  const suggestions={OpenAI:['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'],deepseek:['deepseek-v4-flash','deepseek-v4-pro'],Gemini:['gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-pro-preview'],MiniMax:['MiniMax-M3'],'硅基流动':['deepseek-ai/DeepSeek-V3.2','Pro/deepseek-ai/DeepSeek-V3.2']};
  const fillModels=(models,current='')=>{const list=[...new Set([current,...models].filter(Boolean))];model.innerHTML=list.length?list.map(item=>`<option value="${item}">${item}</option>`).join(''):'<option value="">请先拉取或添加模型</option>';if(current&&list.includes(current))model.value=current;};
  const configured=item => Boolean(item?.apiKey && item?.apiUrl && (settings.model || item?.model));
  const configuredProviders=()=> (settings.providers||[]).filter(item=>item.apiKey&&item.apiUrl);
  const modelsFor=item=>[...new Set([item.model,...(suggestions[item.name]||[])].filter(Boolean))];
  function closeModelPicker() { configuredList.classList.add('hidden'); actions.classList.remove('hidden'); }
  async function applyModelChoice(providerName, modelName) { const providers=(settings.providers||[]).map(item=>item.name===providerName?{...item,model:modelName}:item), steps=settings.enabledSteps||[], scriptModels={...(settings.scriptModels||{})}; steps.forEach(task=>scriptModels[task]={provider:providerName,model:modelName,thinking:thinking.value}); const next={...settings,provider:providerName,model:modelName,apiUrl:providers.find(item=>item.name===providerName)?.apiUrl||'',providers,scriptModels}; const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)}),data=await response.json(); if(!response.ok)throw new Error(data.error||'保存失败'); settings=data.settings; closeModelPicker(); menu.classList.add('hidden'); button.setAttribute('aria-expanded','false'); await render(); showToast(`已切换到 ${providerName} / ${modelName}`); }
  function showConfiguredModels() { const providers=configuredProviders(); if(!providers.length)return false; configuredList.replaceChildren(...providers.map(item=>{const group=document.createElement('section'),header=document.createElement('button'),name=document.createElement('span'),count=document.createElement('small'),choices=document.createElement('div'),models=modelsFor(item);group.className='configured-model-provider';header.type='button';header.className='configured-model-provider-toggle';name.textContent=item.name;count.textContent=`${models.length} 个模型`;header.append(name,count);choices.className='configured-model-choices hidden';models.forEach(modelName=>{const choice=document.createElement('button');choice.type='button';choice.className='configured-model-choice';choice.textContent=modelName;choice.addEventListener('click',()=>applyModelChoice(item.name,modelName).catch(error=>showToast(`模型切换失败：${error.message}`)));choices.append(choice);});header.addEventListener('click',()=>{const isOpen=!choices.classList.toggle('hidden');header.setAttribute('aria-expanded',String(isOpen));});header.setAttribute('aria-expanded','false');group.append(header,choices);return group;})); actions.classList.add('hidden'); configuredList.classList.remove('hidden'); return true; }
  const render=async()=>{ const response=await fetch('/api/settings'), data=await response.json(); if(!response.ok)throw new Error(data.error||'读取模型设置失败'); settings=data.settings||{}; const providers=settings.providers||[]; const providerName=settings.provider||providers[0]?.name||''; providerText.value=providerName; const active=providers.find(item=>item.name===providerName)||providers[0], current=settings.model||active?.model||''; fillModels(suggestions[active?.name]||[active?.model].filter(Boolean),current); apiUrl.value=active?.apiUrl||settings.apiUrl||''; thinking.value=(settings.scriptModels?.generate_prose?.thinking)||'medium'; label.textContent=configured(active)?`${providerName} / ${model.value} / 思考${{无:'无',low:'低',medium:'中',high:'高'}[thinking.value]||'中'}`:'模型未配置'; };
  button.addEventListener('click',async()=>{ const hidden=menu.classList.toggle('hidden'); button.setAttribute('aria-expanded',String(!hidden)); if(!hidden){closeModelPicker();try{await render();}catch(error){showToast(error.message);}} });
  document.querySelector('#saveQuickModel').addEventListener('click',async()=>{const providerName=providerText.value||settings.provider, providers=(settings.providers||[]).map(item=>item.name===providerName?{...item,model:model.value.trim()}:item), steps=settings.enabledSteps||[]; const scriptModels={...(settings.scriptModels||{})}; steps.forEach(task=>scriptModels[task]={provider:providerName,model:model.value.trim(),thinking:thinking.value}); const next={...settings,provider:providerName,model:model.value.trim(),apiUrl:providers.find(item=>item.name===providerName)?.apiUrl||'',providers,scriptModels}; try{const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)}),data=await response.json();if(!response.ok)throw new Error(data.error||'保存失败');settings=data.settings;menu.classList.add('hidden');button.setAttribute('aria-expanded','false');await render();showToast('模型与思考强度已应用到流程');}catch(error){showToast(`模型设置保存失败：${error.message}`);}});
  thinking.addEventListener('change',()=>document.querySelector('#saveQuickModel').click());
  document.querySelector('#manageModels').addEventListener('click',()=>{if(showConfiguredModels())return;menu.classList.add('hidden');button.setAttribute('aria-expanded','false');document.querySelector('#settings').click();setTimeout(()=>document.querySelector('[data-settings-tab="model"]')?.click(),0);});
  document.addEventListener('click',event=>{if(!event.target.closest('.model-control')){menu.classList.add('hidden');button.setAttribute('aria-expanded','false');}});
  render().catch(()=>{});
})();

/* 将生成目标和流程状态集中在输入框上方；模型控件仍留在底部操作栏。 */
(() => { const context=document.querySelector('#generationContext'), modelControl=document.querySelector('.model-control'), workflow=document.querySelector('.composer-workflow'), actions=document.querySelector('.composer-actions'), writeMode=document.querySelector('.write-mode'); if(!context||!modelControl||!workflow||!actions||!writeMode)return; writeMode.after(modelControl); const row=document.createElement('div'); row.className='composer-status-row'; context.before(row); row.append(context,workflow); })();

/* 标准模式桥接：对话 AI 只需准备 script_input，再通过此接口激活命名流程脚本。
   当前原型没有内置模型供应商；接入聊天模型后调用 window.novelWorkflow.run(task, input) 即可。 */
(() => {
  let activeRun = null;
  const sendButton=document.querySelector('#composer button[type="submit"]');
  function setRunState(run) { activeRun=run; if(sendButton)sendButton.textContent=run?'终止':'发送 ↵'; }
  sendButton?.addEventListener('click',async event=>{if(!activeRun)return;event.preventDefault();event.stopImmediatePropagation();const run=activeRun;sendButton.disabled=true;try{await fetch('/api/workflow/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:run.id})});}finally{sendButton.disabled=false;}} ,true);
  const request = async (url, options={}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || '流程执行失败');
      if (data.usage) error.usage = data.usage;
      throw error;
    }
    return data;
  };
  const TASK_LABELS = {
    compile_intro:'小说简介', generate_worldview_json:'世界观', compile_style:'语言风格',
    compile_character_roster:'角色名单', generate_characters_batch:'角色卡', generate_character:'角色卡',
    compile_relation:'关系卡', compile_plot:'剧情书', compile_volume:'剧情卷', compile_ledger:'信息账本',
    compile_anchor:'强制设定锚点', compile_config:'配置', compile_dialogue:'台词', compile_snapshot:'最终提示词快照',
    generate_prose:'正文', rewrite_prose:'改写正文', validate:'校验与验收',
    text_stats:'原文统计', word_frequency:'高频词', style:'原文风格', positive_vocabulary:'正向词库', exclusive_vocabulary:'专属词库'
  };
  const taskLabel = task => TASK_LABELS[task] || task;
  async function run(task, input, inputComplete=false) {
    const project = window.novelLocal?.active?.();
    if (!project?.diskName) throw new Error('请先选择本地小说项目');
    const inputMode = typeof input === 'string' ? 'natural' : 'structured';
    const messages=document.querySelector('#messages'), run={id:crypto.randomUUID()}; let pending=null;
    setRunState(run);
    const pendingTimer=setTimeout(()=>{messages.querySelectorAll('.generation-pending').forEach(item=>item.remove());messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message generation-pending"><div class="avatar">AI</div><div><p>正在生成${taskLabel(task)}。</p><div class="generation-progress" role="status" aria-label="正在生成"><i></i></div></div></article>`);pending=messages.lastElementChild;messages.scrollTop=messages.scrollHeight;},300); let result;
    try { result = await request('/api/workflow/run', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(inputMode === 'natural'
        ? {task, project:project.diskName, inputMode, naturalInput:input, runId:run.id}
        : {task, project:project.diskName, inputMode, input, inputComplete, runId:run.id})
    }); } catch (error) { pending?.remove(); if (/API|api|配置/.test(error.message)) showApiSetupPrompt(error.message); throw error; }
    finally { clearTimeout(pendingTimer); if(activeRun?.id===run.id)setRunState(null); }
    pending?.remove();
    return result;
  }
  window.novelWorkflow = { run };
  document.addEventListener('novel:run-workflow', async event => {
    try { await run(event.detail.task, event.detail.input, event.detail.inputComplete === true); }
    catch (error) { recordWorkflowFailure(event.detail.task,event.detail.task,error); showToast(`${workflowFailureTitle(error)}：详情已保留在对话中`,5000); }
  });
})();

/* 卷层级：小说 → 卷 → 章。仅扩展既有章节框，不替换原流程交互。 */
(() => {
  const request=async(url,options={})=>{const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'请求失败');return d;};
  let activeVolume='', activeChapterFile='';
  const projectPanel=document.querySelector('.projects');
  const chapterBox=document.querySelector('.chapter-box');
  const box=document.createElement('div'); box.className='chapter-box'; box.id='volumeBox'; box.style.cssText='margin:0;padding:0;font-size:12px;line-height:16px'; box.innerHTML='<div id="volumeList"></div><button type="button" class="create-chapter" id="newVolume" style="padding:5px 9px;font-size:12px;line-height:16px">＋ 新建卷</button>';
  chapterBox.before(box);
  const project=()=>window.novelLocal?.active?.();
  const prose=node=>node?.children||[];
  async function refreshVolumes(){const item=project();if(!item)return;let tree=await request(`/api/projects/${encodeURIComponent(item.diskName)}/tree`);let proseRoot=tree.tree.find(node=>node.name==='正文');if(prose(proseRoot).some(node=>node.type==='file'&&/\.txt$/i.test(node.name))){await request('/api/migrate/first-volume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:item.diskName})});tree=await request(`/api/projects/${encodeURIComponent(item.diskName)}/tree`);proseRoot=tree.tree.find(node=>node.name==='正文');}const volumes=prose(proseRoot).filter(node=>node.type==='directory');if(!activeVolume||!volumes.some(node=>node.name===activeVolume))activeVolume=volumes[0]?.name||'';chapterBox.remove();document.querySelector('#volumeList').innerHTML=volumes.map(node=>`<button type="button" class="volume-row ${node.name===activeVolume?'active':''}" data-volume="${node.name}" style="padding:5px 9px;font-size:12px;line-height:16px"><span class="project-dot"></span><span>${node.name}</span></button>`).join('')||'<span class="form-note">暂无卷</span>';const activeButton=document.querySelector(`#volumeList [data-volume="${activeVolume}"]`);if(activeButton)activeButton.after(chapterBox);else box.prepend(chapterBox);chapterBox.style.cssText='margin:1px 0 1px 17px;padding:0;font-size:12px;line-height:16px';document.querySelector('#chapterPicker').style.cssText='padding:5px 8px;font-size:12px;line-height:16px';await loadVolume(tree,activeVolume);}
  const chapterDisplayName = (raw,index) => { const title=raw.replace(/^第(?:\d+|[一二三四五六七八九十百千零两]+)章[：:]?\s*/, '').trim() || '未命名'; return `第${index+1}章：${title}`; };
  async function loadVolume(tree,volume){if(!volume)return;const item=project(), proseRoot=tree.tree.find(node=>node.name==='正文'), node=prose(proseRoot).find(entry=>entry.name===volume), chapters=prose(node).filter(entry=>entry.type==='file'&&/\.txt$/i.test(entry.name)), previous=new Map(item.chapters.map(chapter=>[chapter.name,chapter]));item.files['正文'].splice(0,item.files['正文'].length,...chapters.map(entry=>entry.name));item.chapters=chapters.map((entry,index)=>({id:crypto.randomUUID(),name:entry.name.replace(/\.txt$/i,''),displayName:chapterDisplayName(entry.name.replace(/\.txt$/i,''),index),index:0,checked:false,approved:false,...(previous.get(entry.name.replace(/\.txt$/i,''))||{})}));const selected=chapters.find(entry=>entry.name===activeChapterFile)||chapters[0];activeChapterFile=selected?.name||'';item.chapterId=item.chapters.find(chapter=>`${chapter.name}.txt`===activeChapterFile)?.id||null;for(const entry of chapters){const path=`正文/${volume}/${entry.name}`,data=await request(`/api/file?project=${encodeURIComponent(item.diskName)}&path=${encodeURIComponent(path)}`);item.paths[entry.name]=path;item.content[entry.name]=data.content;}document.querySelector('#chapterMenu').innerHTML=`${item.chapters.map(chapter=>`<button type="button" data-chapter="${chapter.displayName}" data-volume-chapter-file="${chapter.name}.txt">${chapter.displayName}</button>`).join('')}<button type="button" class="create-chapter" id="newChapterInVolume">＋ 新建章</button>`;document.querySelector('#chapterPicker').childNodes[0].nodeValue=`${item.chapters.find(chapter=>`${chapter.name}.txt`===activeChapterFile)?.displayName||'新建第1章'} `;renderFiles('正文');if(activeChapterFile)window.novelLocal?.selectChapterByFile?.(activeChapterFile,false);}
  box.addEventListener('click',async event=>{const item=project();if(!item)return;const volume=event.target.closest('[data-volume]');if(volume){activeVolume=volume.dataset.volume;activeChapterFile='';return refreshVolumes();}if(event.target.closest('#newVolume')){document.querySelector('#volumeName').value='';document.querySelector('#volumeModal').classList.remove('hidden');document.querySelector('#volumeName').focus();}});
  document.querySelector('#volumeForm').addEventListener('submit',async event=>{event.preventDefault();const item=project(),name=document.querySelector('#volumeName').value.trim();if(!item)return;const next=name||`第 ${document.querySelectorAll('#volumeList [data-volume]').length+1} 卷`;try{await request('/api/file',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:item.diskName,path:`正文/${next}/.volume.md`,content:`# ${next}`})});document.querySelector('#volumeModal').classList.add('hidden');activeVolume=next;await refreshVolumes();}catch(error){showToast(`新建卷失败：${error.message}`);}});
  document.querySelector('#chapterMenu').addEventListener('click',event=>{const selected=event.target.closest('[data-volume-chapter-file]');if(selected){activeChapterFile=selected.dataset.volumeChapterFile;window.novelLocal?.selectChapterByFile?.(activeChapterFile,false);return;}if(!event.target.closest('#newChapterInVolume'))return;event.preventDefault();event.stopImmediatePropagation();const item=project(),modal=document.querySelector('#chapterModal');if(!item)return;const n=item.chapters.length+1;modal.dataset.volume=activeVolume;document.querySelector('#chapterModal .modal-title strong').textContent=`新建第${n}章`;document.querySelector('#chapterModal .form-note').textContent=`将在${activeVolume}创建正文，并从“锚点”开始生成。`;document.querySelector('#chapterName').placeholder=`例如：第${n}章：退婚`;modal.classList.remove('hidden');document.querySelector('#chapterName').focus();});
  document.addEventListener('novel:project-switched',event=>{if(event.detail?.chapterFile)activeChapterFile=event.detail.chapterFile;refreshVolumes().catch(error=>showToast(`卷加载失败：${error.message}`));});
  setTimeout(()=>refreshVolumes().catch(error=>showToast(`卷加载失败：${error.message}`)),800);
})();

/* 本地文件桥接：拦截原型按钮，保留原有流程与界面。 */
(() => {
  const request = async (url, options={}) => { const response=await fetch(url,options); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||'请求失败'); return data; };
  const project = () => window.novelLocal?.active?.();
  const filePath = (item=project()) => item?.paths?.[currentFile] || (item ? window.novelLocal.localPath(item,currentFile) : '');
  const reload = () => location.reload();
  const failure = error => showToast(`本地操作失败：${error.message}`);
  const chooseSource = () => { let input=document.querySelector('#localSourceUpload'); if(!input){ input=document.createElement('input'); input.id='localSourceUpload'; input.type='file'; input.accept='.txt,.md,.doc,.docx'; input.className='hidden'; document.body.append(input); input.addEventListener('change',async()=>{ const item=project(), file=input.files[0]; if(!item||!file)return; const reader=new FileReader(); reader.onload=async()=>{ try { await request('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:item.diskName,name:file.name,data:reader.result})}); showToast('原著已上传到本地项目'); } catch(error){ failure(error); } finally { input.value=''; } }; reader.readAsDataURL(file); }); } input.click(); };
  document.addEventListener('click', event => {
    const assetAction=event.target.closest('[data-asset-action="delete"],[data-header-asset-action="delete"]');
    if(assetAction){ const item=project(), asset=assetAction.closest('.asset-item,.header-asset')?.querySelector('[data-asset]'), source=item?.paths?.[asset?.dataset.asset] || (item&&asset ? window.novelLocal.localPath(item,asset.dataset.asset) : ''); if(!item||!asset||!source)return; event.preventDefault(); event.stopPropagation(); if(confirm(`确定删除文件 ${asset.dataset.asset} 吗？`)) request(`/api/file?project=${encodeURIComponent(item.diskName)}&path=${encodeURIComponent(source)}`,{method:'DELETE'}).then(reload).catch(failure); return; }
    const action=event.target.closest('[data-project-action]');
    if(action){ const item=project(); if(!item)return; event.preventDefault(); event.stopPropagation(); if(action.dataset.projectAction==='upload') return chooseSource(); if(action.dataset.projectAction==='rename'){ const name=prompt('小说名称',item.name.replace(/^(原创|同人)-/,'')); if(!name)return; request(`/api/projects/${encodeURIComponent(item.diskName)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,type:item.type})}).then(data=>{sessionStorage.setItem('novel:active-project',data.project);reload();}).catch(failure); } if(action.dataset.projectAction==='delete'&&confirm(`确定删除小说 ${item.name} 及全部文件吗？`)) request(`/api/projects/${encodeURIComponent(item.diskName)}`,{method:'DELETE'}).then(reload).catch(failure); return; }
    if(event.target.closest('#renameCurrentFile')){ const item=project(); if(!item||!currentFile)return; event.preventDefault(); event.stopPropagation(); const source=filePath(item), name=prompt('新文件名',currentFile); if(!name||name===currentFile)return; const target=`${source.slice(0,source.lastIndexOf('/')+1)}${name}`; request('/api/file',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:item.diskName,from:source,to:target})}).then(reload).catch(failure); return; }
    if(event.target.closest('#deleteCurrentFile')){ const item=project(); if(!item||!currentFile)return; event.preventDefault(); event.stopPropagation(); if(confirm(`确定删除文件 ${currentFile} 吗？`)) request(`/api/file?project=${encodeURIComponent(item.diskName)}&path=${encodeURIComponent(filePath(item))}`,{method:'DELETE'}).then(reload).catch(failure); return; }
    if(event.target.closest('#deleteChapter')){ const item=project(), chapterItem=item?.chapters?.find(entry=>entry.id===item.chapterId)||item?.chapters?.find(entry=>`${entry.name}.txt`===currentFile); if(!item||!chapterItem)return; event.preventDefault(); event.stopPropagation(); if(confirm(`确定删除章节 ${chapterItem.name} 及其提示词吗？`)) window.novelLocal.deleteCurrentChapter().catch(failure); return; }
    if(event.target.closest('#renameChapter')){ const item=project(), chapterItem=item?.chapters?.find(entry=>entry.id===item.chapterId)||item?.chapters?.find(entry=>`${entry.name}.txt`===currentFile); if(!item||!chapterItem)return; event.preventDefault(); event.stopPropagation(); const renamed=prompt('新章节名称',chapterItem.name); if(!renamed||renamed===chapterItem.name)return; const source=item.paths?.[`${chapterItem.name}.txt`]||window.novelLocal.localPath(item,`${chapterItem.name}.txt`); request('/api/chapter',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:item.diskName,prosePath:source,name:renamed})}).then(data=>{const next=renamed.replace(/\.txt$/i,''),oldFile=`${chapterItem.name}.txt`,newFile=`${next}.txt`;chapterItem.name=next;if(item.paths?.[oldFile]){item.paths[newFile]=data.path;delete item.paths[oldFile];}if(Object.hasOwn(item.content||{},oldFile)){item.content[newFile]=item.content[oldFile];delete item.content[oldFile];}document.dispatchEvent(new CustomEvent('novel:project-switched',{detail:{chapterFile:newFile}}));showToast(`已重命名为${next}`);}).catch(failure); return; }
  },true);
})();

/* 结构化资产编辑：与原有 Markdown 编辑并存，保存时编译为可读文件。 */
(() => {
  const modal = document.querySelector('#structuredModal');
  const form = document.querySelector('#structuredForm');
  const fields = document.querySelector('#structuredFields');
  const preview = document.querySelector('#structuredPreview');
  const title = document.querySelector('#structuredTitle');
  const drafts = new Map();
  let target = '';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const simpleSchemas = {
    world: { title:'世界观', fields:[['小说类型','例如：东方玄幻、悬疑'],['世界基础','时代、地域与社会规则','textarea'],['力量体系','等级、能力与限制','textarea'],['势力与组织','主要势力、立场与冲突','textarea'],['资源设定','货币、物资、稀缺资源','textarea']] },
    character: { title:'角色卡', fields:[['姓名',''],['身份','职业、阵营、社会位置'],['重要性','主角 / 重要配角 / 配角 / 路人','select',['主角','重要配角','配角','路人']],['性格','关键词之间用顿号分隔','textarea'],['价值观与目标','角色想要什么、底线是什么','textarea'],['外貌气质','外貌、身材、服饰偏好','textarea'],['语言习惯','用词、口头禅、语速、音色','textarea'],['能力与限制','能力、境界、弱点','textarea'],['经历时间轴','关键经历按时间填写','textarea']] },
    relation: { title:'关系卡', fields:[['角色 A',''],['角色 B',''],['彼此称呼',''],['关系类型','亲属、盟友、敌对等'],['情感状态','信任、疏离、暧昧等','textarea'],['共同经历','塑造关系的关键事件','textarea'],['当前态度','本章开始时的关系状态','textarea']] },
    anchor: { title:'强制设定锚点', fields:[['出场角色与情绪','例如：角色名（情绪）、另一角色（情绪）','textarea'],['核心事件','本章必须发生的事件','textarea'],['信息边界','可以揭示与禁止揭示的信息','textarea'],['伏笔','要埋下或回应的线索','textarea'],['钩子','章节末尾的悬念或推动','textarea']] },
    dialogue: { title:'台词', fields:[['角色名',''],['心理或动作','例如：压低声音、指尖收紧'],['台词内容','', 'textarea'],['对话目的','推进的信息、冲突或情绪','textarea']] }
  };
  const configGroups = [
    ['叙事视角',['第一人称','第三人称'],'single'],
    ['叙事结构',['顺叙','倒叙','插叙'],'multi'],
    ['结构模板',['铺垫蓄势','冲突递进','悬念收束'],'single'],
    ['事件评级',['主线','支线','闲笔'],'single'],
    ['场景组织',['单场景','多场景'],'single'],
    ['信息安排',['背景设定','场景氛围','前置剧情','人物出场','信息揭示','身份揭示','回忆/前情','冲突','伏笔','悬念','回应/揭示','对话引入','场景切换'],'multi'],
    ['人物变化',['性格对比','心理状态','关系变化','结尾状态'],'multi'],
    ['事件要素',['误会','危机','反转','和解'],'multi'],
    ['表达方式',['叙述','描写','抒情','议论','说明'],'multi'],
    ['行为触发',['对话/声响触发','情绪触发','对比','延宕','因果链'],'multi']
  ];

  function kind(name) {
    if (name === '世界观.md') return 'world';
    if (name.includes('角色卡')) return 'character';
    if (name.includes('关系卡')) return 'relation';
    if (name === '强制设定锚点.md') return 'anchor';
    if (name === '配置.md') return 'config';
    if (name === '台词.md') return 'dialogue';
    return null;
  }
  function defaultDraft(type) {
    if (type === 'config') return Object.fromEntries(configGroups.map(([label,, mode]) => [label, mode === 'multi' ? [] : '']));
    return Object.fromEntries(simpleSchemas[type].fields.map(([label]) => [label, '']));
  }
  function inputMarkup(label, hint, type, options, value) {
    if (type === 'textarea') return `<label>${label}<textarea name="${escape(label)}" placeholder="${escape(hint)}">${escape(value)}</textarea></label>`;
    if (type === 'select') return `<label>${label}<select name="${escape(label)}">${options.map(option => `<option ${option === value ? 'selected' : ''}>${escape(option)}</option>`).join('')}</select></label>`;
    return `<label>${label}<input name="${escape(label)}" value="${escape(value)}" placeholder="${escape(hint)}" /></label>`;
  }
  function compileSimple(type, data) {
    const schema = simpleSchemas[type];
    if (type === 'dialogue') return `# ${schema.title}\n\n${data['角色名'] || '角色'}：${data['心理或动作'] ? `[${data['心理或动作']}]` : ''}“${data['台词内容'] || ''}”\n\n## 对话目的\n${data['对话目的'] || ''}`;
    return `# ${schema.title}\n\n${schema.fields.map(([label]) => `## ${label}\n${data[label] || ''}`).join('\n\n')}`;
  }
  function compileConfig(data) {
    return `# 本章配置\n\n${configGroups.map(([label,, mode]) => `## ${label}\n${mode === 'multi' ? (data[label] || []).join('、') : (data[label] || '')}`).join('\n\n')}`;
  }
  function refreshPreview() {
    const type = kind(target);
    const data = drafts.get(target);
    preview.value = type === 'config' ? compileConfig(data) : compileSimple(type, data);
  }
  function render() {
    const type = kind(target);
    const data = drafts.get(target);
    if (type === 'config') {
      title.textContent = '配置｜选择式编辑';
      fields.innerHTML = configGroups.map(([label, options, mode]) => `<div class="choice-group"><span>${label}${mode === 'multi' ? '（可多选）' : '（单选）'}</span><div class="choice-list">${options.map(option => `<button type="button" class="choice ${(mode === 'multi' ? data[label].includes(option) : data[label] === option) ? 'selected' : ''}" data-config-group="${escape(label)}" data-config-option="${escape(option)}" data-config-mode="${mode}">${option}</button>`).join('')}</div></div>`).join('');
    } else {
      const schema = simpleSchemas[type];
      title.textContent = `${schema.title}｜结构化编辑`;
      fields.innerHTML = `<div class="structured-grid">${schema.fields.map(([label, hint, fieldType, options]) => inputMarkup(label, hint, fieldType, options, data[label])).join('')}</div>`;
    }
    refreshPreview();
  }
  document.querySelector('#structuredEdit').addEventListener('click', () => {
    const type = kind(currentFile);
    if (!type) return showToast('当前文件暂不支持结构化编辑');
    target = currentFile;
    if (!drafts.has(target)) drafts.set(target, defaultDraft(type));
    render();
    modal.classList.remove('hidden');
  });
  fields.addEventListener('input', event => {
    const input = event.target.closest('[name]');
    if (!input) return;
    drafts.get(target)[input.name] = input.value;
    refreshPreview();
  });
  fields.addEventListener('click', event => {
    const choice = event.target.closest('[data-config-group]');
    if (!choice) return;
    const data = drafts.get(target), group = choice.dataset.configGroup, option = choice.dataset.configOption;
    if (choice.dataset.configMode === 'single') data[group] = option;
    else data[group] = data[group].includes(option) ? data[group].filter(item => item !== option) : [...data[group], option];
    render();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const type = kind(target);
    fileState[target] = type === 'config' ? compileConfig(drafts.get(target)) : compileSimple(type, drafts.get(target));
    document.dispatchEvent(new CustomEvent('novel:file-saved', { detail:{ name:target, value:fileState[target] } }));
    if (currentFile === target) { content.value = fileState[target]; footer.textContent = '已保存结构化内容'; }
    modal.classList.add('hidden');
    showToast(`${target} 已保存`);
  });
  document.querySelectorAll('[data-close-structured]').forEach(button => button.addEventListener('click', () => modal.classList.add('hidden')));
})();

/* 顶部 ••• 菜单：重置对话 / 删除小说 */
(() => {
  const more = document.querySelector('#headerMore'), menu = document.querySelector('#headerMenu');
  more?.addEventListener('click', event => { event.stopPropagation(); menu?.classList.toggle('hidden'); });
  document.addEventListener('click', event => { if (!event.target.closest('.header-menu-wrap')) menu?.classList.add('hidden'); });
  document.querySelector('#resetConversation')?.addEventListener('click', async () => {
    const project = window.novelLocal?.active?.();
    if (!project) return;
    if (!confirm('重置当前对话？将删除所有生成文件，但保留项目入口。')) return;
    const paths = new Set();
    for (const group of Object.keys(project.files || {})) for (const name of project.files[group] || []) if (project.paths?.[name]) paths.add(project.paths[name]);
    for (const p of paths) { try { await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(p)}`, { method:'DELETE' }); } catch (_) {} }
    project.files = Object.fromEntries(['正文','提示词','知识库','词汇库','剧情','提取'].map(g => [g, []]));
    project.content = {}; project.paths = {}; project.usage = { prompt_tokens:0, completion_tokens:0, total_tokens:0, response_time:0, calls:0 };
    project.initialized = false; project.initIndex = 0; project.chapters = []; project.chapterId = null;
    const resetPaths = ['运行记录/workflow-state.json','运行记录/执行记录/初始化.jsonl','运行记录/对话记录.md'];
    try {
      const treeResponse = await fetch(`/api/projects/${encodeURIComponent(project.diskName)}/tree`);
      const treeData = await treeResponse.json();
      if (treeResponse.ok && Array.isArray(treeData.tree)) {
        const walk = nodes => nodes.forEach(node => {
          if (node.type === 'file') {
            if (node.path.startsWith('运行记录/执行记录/') && /\.jsonl$/i.test(node.name)) resetPaths.push(node.path);
          } else if (node.type === 'directory') walk(node.children || []);
        });
        walk(treeData.tree);
      }
    } catch (_) {}
    for (const p of resetPaths) { try { await fetch(`/api/file?project=${encodeURIComponent(project.diskName)}&path=${encodeURIComponent(p)}`, { method:'DELETE' }); } catch (_) {} }
    location.reload();
  });
  document.querySelector('#deleteProject')?.addEventListener('click', () => {
    const project = window.novelLocal?.active?.();
    if (!project) return;
    if (confirm(`确定删除小说 ${project.name} 及全部文件吗？`)) fetch(`/api/projects/${encodeURIComponent(project.diskName)}`, { method:'DELETE' }).then(() => location.reload()).catch(error => alert(error.message));
  });
})();
