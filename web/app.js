const files = {
  "正文": ["第 3 章.txt", "第 2 章.txt", "第 1 章.txt"],
  "提示词": ["强制设定锚点.md", "配置.md", "台词.md", "最终提示词快照.md", "校验报告.md"],
  "知识库": ["世界观.md", "语言风格.md", "角色卡-沈栖迟.md", "关系卡-沈栖迟-陆闻洲.md", "信息卡.md", "信息账本.md"],
  "剧情": ["剧情书.md", "第 1 卷.md"],
  "提取": ["原文统计.md", "原文风格.md", "高频词.md"]
};
const samples = {
  "第 3 章.txt": "第 3 章 旧码头\n\n雨落得很密，旧码头的木板被打得发黑。\n\n沈栖迟停在锈蚀的栏杆旁，没有立刻向前。\n\n[那封信的落款，分明不该出现在这里。]",
  "台词.md": "# 第 3 章台词\n\n沈栖迟：[压低声音]“你约我来这里，到底想说什么？”\n\n陆闻洲：“先别问。你看完这封信，再决定要不要走。”\n\n沈栖迟：[指尖收紧]“信是谁写的？”",
  "强制设定锚点.md": "# 第 3 章强制设定锚点\n\n- 出场角色：沈栖迟（戒备）、陆闻洲（克制）\n- 核心事件：陆闻洲在旧码头交出一封旧信。\n- 信息边界：信的寄件人不公开。\n- 伏笔：信封上的盐渍。\n- 钩子：沈栖迟发现信封背面有自己的名字。"
};
const fileState = { ...samples };
const fileList = document.querySelector('#fileList');
const documentTabs = document.querySelector('#documentTabs');
const content = document.querySelector('#documentContent');
const path = document.querySelector('#documentPath');
const footer = document.querySelector('#documentFooter');
const editButton = document.querySelector('#editButton');
let openFiles = ["第 3 章.txt"];
let currentFile = "第 3 章.txt";
let editing = false;
let editStartValue = '';

function fileContent(name) { return fileState[name] || `# ${name.replace(/\.(md|txt)$/, '')}\n\n此文件已创建，等待补充内容。`; }
function renderFiles(group) { fileList.innerHTML = files[group].map(name => `<button class="file-row ${name === currentFile ? 'active' : ''}" data-file="${name}"><span class="file-glyph"></span>${name}</button>`).join(''); }
function renderTabs() { documentTabs.innerHTML = openFiles.map(name => `<button class="document-tab ${name === currentFile ? 'active' : ''}" data-tab="${name}"><span>${name}</span><span class="tab-close" data-close="${name}" aria-label="关闭 ${name}">×</span></button>`).join(''); }
function setEditorMode(nextEditing) { editing = nextEditing; content.readOnly = !editing; editButton.textContent = editing ? '保存' : '编辑'; editButton.classList.toggle('editing', editing); document.querySelector('#undoEdit').classList.toggle('hidden', !editing); document.querySelector('#cancelEdit').classList.toggle('hidden', !editing); footer.textContent = editing ? '编辑模式：修改尚未保存' : '只读模式'; }
function openFile(name) { if (!openFiles.includes(name)) openFiles.push(name); currentFile = name; content.value = fileContent(name); path.textContent = `当前文件 / ${name}`; setEditorMode(false); renderTabs(); document.querySelectorAll('.file-row').forEach(row => row.classList.toggle('active', row.dataset.file === name)); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 1800); }
function setGenerationTarget(name, file = name) { document.querySelector('#generationTarget').textContent = name; document.querySelector('#generationContext').dataset.file = file; }
function autoGrowComposer() { const input = document.querySelector('#prompt'); input.style.height = 'auto'; input.style.height = `${Math.min(Math.max(input.scrollHeight, 56), 180)}px`; input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden'; }
function openGenerationPrompt(name, group, verb = '生成', targetName = name) { const input = document.querySelector('#prompt'); setGenerationTarget(targetName, name); input.value = `请${verb}文件：${group}/${name}\n\n`; autoGrowComposer(); input.focus(); }

document.querySelector('#fileGroups').addEventListener('click', event => { const button = event.target.closest('button[data-group]'); if (!button) return; document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item === button)); renderFiles(button.dataset.group); });
fileList.addEventListener('click', event => { const row = event.target.closest('[data-file]'); if (row) openFile(row.dataset.file); });
documentTabs.addEventListener('click', event => { const close = event.target.closest('[data-close]'); if (close) { const name = close.dataset.close; openFiles = openFiles.filter(file => file !== name); if (!openFiles.length) openFiles = ["第 3 章.txt"]; if (currentFile === name) currentFile = openFiles[openFiles.length - 1]; openFile(currentFile); return; } const tab = event.target.closest('[data-tab]'); if (tab) openFile(tab.dataset.tab); });
editButton.addEventListener('click', () => { if (!editing) { editStartValue = content.value; setEditorMode(true); setGenerationTarget(currentFile); content.focus(); showToast(`本次生成：${currentFile}`); return; } fileState[currentFile] = content.value; setEditorMode(false); footer.textContent = '已保存'; showToast(`${currentFile} 已保存`); });
document.querySelector('#undoEdit').addEventListener('click', () => { content.value = editStartValue; footer.textContent = '已撤回至开始编辑时的内容'; });
document.querySelector('#cancelEdit').addEventListener('click', () => { content.value = editStartValue; setEditorMode(false); showToast('已取消编辑，未保存修改已放弃'); });
document.querySelector('#chapterPicker').addEventListener('click', () => document.querySelector('#chapterMenu').classList.toggle('hidden'));
document.querySelector('#chapterMenu').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.id === 'createChapter') { document.querySelector('#chapterModal').classList.remove('hidden'); document.querySelector('#chapterName').focus(); } else { document.querySelector('#chapterPicker').childNodes[0].nodeValue = `${button.dataset.chapter} `; showToast(`已切换至${button.dataset.chapter}`); } document.querySelector('#chapterMenu').classList.add('hidden'); });
document.querySelector('#newProject').addEventListener('click', () => { document.querySelector('#projectModal').classList.remove('hidden'); document.querySelector('#projectName').focus(); }); document.querySelector('#settings').addEventListener('click', () => showToast('设置面板将在左下角展开')); 
document.querySelectorAll('.generated-file').forEach(button => button.addEventListener('click', () => { openFile(button.dataset.file); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === '提示词')); renderFiles('提示词'); }));
document.querySelector('#composer').addEventListener('submit', event => { event.preventDefault(); const input = document.querySelector('#prompt'); const text = input.value.trim(); if (!text) return; const messages = document.querySelector('#messages'); const target = document.querySelector('#generationTarget').textContent; const targetFile = document.querySelector('#generationContext').dataset.file; messages.insertAdjacentHTML('beforeend', `<article class="message user-message"><div><p>${text.replace(/</g, '&lt;')}</p></div></article><article class="message assistant-message completion"><div class="avatar">AI</div><div><p>操作已完成。已生成文件，可在右侧打开查看。</p><button class="generated-file" type="button" data-file="${targetFile}"><span class="done-icon">✓</span> 已生成 <strong>${target}</strong><span class="open-arrow">打开 ›</span></button><div class="message-actions"><button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" data-action="next">下一步</button></div></div></article>`); input.value = ''; autoGrowComposer(); messages.scrollTop = messages.scrollHeight; });
document.querySelector('#prompt').addEventListener('input', autoGrowComposer);
document.querySelector('#messages').addEventListener('click', event => { const file = event.target.closest('.generated-file'); if (file) { openFile(file.dataset.file); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === '提示词')); renderFiles('提示词'); return; } const action = event.target.closest('[data-action]'); if (!action) return; const card = action.closest('.completion'); if (action.dataset.action === 'undo') { card.remove(); showToast('已撤回本次生成'); } if (action.dataset.action === 'retry') { card.querySelector('p').textContent = '已重新生成，可打开文件查看新版本。'; showToast('已重新生成'); } if (action.dataset.action === 'next') advanceFlow(); });
document.querySelector('#projectForm').addEventListener('submit', event => { event.preventDefault(); const name = document.querySelector('#projectName').value.trim(); const type = document.querySelector('input[name="projectType"]:checked').value; if (!name) return; const project = document.createElement('button'); project.type = 'button'; project.className = 'project'; project.innerHTML = `<span class="project-dot"></span><span>${type}-${name}</span><span class="count">01</span>`; document.querySelector('.other-projects').after(project); document.querySelector('#projectModal').classList.add('hidden'); event.target.reset(); showToast(`已创建${type}-${name}`); });
document.querySelector('#chapterForm').addEventListener('submit', event => { event.preventDefault(); const name = document.querySelector('#chapterName').value.trim(); if (!name) return; files['正文'].unshift(`${name}.txt`); document.querySelector('#chapterPicker').childNodes[0].nodeValue = `${name} `; document.querySelector('#chapterModal').classList.add('hidden'); event.target.reset(); renderFiles('正文'); showToast(`已创建${name}及提示词文件`); });
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeModal}`).classList.add('hidden')));
document.querySelector('.search-button').addEventListener('click', () => { document.querySelector('#searchPanel').classList.remove('hidden'); document.querySelector('#searchInput').focus(); });
document.querySelector('#closeSearch').addEventListener('click', () => document.querySelector('#searchPanel').classList.add('hidden'));
document.querySelector('#searchForm').addEventListener('submit', event => { event.preventDefault(); const q = document.querySelector('#searchInput').value.trim().toLowerCase(); const results = Object.entries(files).flatMap(([group, names]) => names.filter(name => name.toLowerCase().includes(q)).map(name => ({ group, name }))); document.querySelector('#searchResults').innerHTML = q ? (results.length ? results.map(item => `<button class="search-result" type="button" data-result="${item.name}" data-result-group="${item.group}">${item.group} / ${item.name}</button>`).join('') : '<span>没有匹配的文件</span>') : '<span>请输入关键词后点击“查找”</span>'; });
document.querySelector('#searchResults').addEventListener('click', event => { const result = event.target.closest('[data-result]'); if (!result) return; openFile(result.dataset.result); document.querySelector('#searchPanel').classList.add('hidden'); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === result.dataset.resultGroup)); renderFiles(result.dataset.resultGroup); });
const resizer = document.querySelector('#workspaceResizer'); resizer.addEventListener('pointerdown', event => { resizer.classList.add('dragging'); resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', event => { if (!resizer.classList.contains('dragging')) return; const width = Math.max(360, Math.min(700, window.innerWidth - event.clientX)); document.querySelector('.app-shell').style.setProperty('--workspace-width', `${width}px`); }); resizer.addEventListener('pointerup', () => resizer.classList.remove('dragging'));
let phaseIndex = 0;
const phases = [
  { name: '台词', next: '下一步：生成正文', message: '已进入正文阶段，并准备好本章生成材料。', file: '第 3 章.txt', label: '正文草稿' },
  { name: '正文', next: '下一步：校验与验收', message: '正文已生成，已进入校验与验收阶段。', file: '校验报告.md', label: '校验报告' },
  { name: '验收', next: '下一章：第 4 章', message: '', file: '', label: '' }
];
function updatePhaseHeader() { const phase = phases[phaseIndex]; document.querySelector('.workflow').innerHTML = `<span class="status-dot"></span>当前阶段：${phase.name}`; document.querySelector('#nextStep').innerHTML = `${phase.next} <span>›</span>`; }
function advanceFlow() { if (phaseIndex === 2) { document.querySelector('#chapterPicker').childNodes[0].nodeValue = '第 4 章：未命名 '; document.querySelector('.chat-title h1').textContent = '第 4 章：未命名'; phaseIndex = 0; updatePhaseHeader(); showToast('已跳转到第 4 章'); return; } const phase = phases[phaseIndex]; phaseIndex += 1; const messages = document.querySelector('#messages'); messages.insertAdjacentHTML('beforeend', `<article class="message assistant-message completion"><div class="avatar">AI</div><div><p>${phase.message}</p><button class="generated-file" type="button" data-file="${phase.file}"><span class="done-icon">✓</span> 已生成 <strong>${phase.label}</strong><span class="open-arrow">打开 ›</span></button><div class="message-actions"><button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" data-action="next">下一步</button></div></div></article>`); updatePhaseHeader(); messages.scrollTop = messages.scrollHeight; showToast(`已进入${phases[phaseIndex].name}阶段`); }
document.querySelector('#nextStep').addEventListener('click', advanceFlow);
const fileResizer = document.querySelector('#fileResizer'); fileResizer.addEventListener('pointerdown', event => { fileResizer.classList.add('dragging'); fileResizer.setPointerCapture(event.pointerId); }); fileResizer.addEventListener('pointermove', event => { if (!fileResizer.classList.contains('dragging')) return; const workspaceTop = document.querySelector('.workspace').getBoundingClientRect().top; const height = Math.max(64, Math.min(360, event.clientY - workspaceTop - 78)); document.querySelector('.file-list').style.setProperty('--file-list-height', `${height}px`); }); fileResizer.addEventListener('pointerup', () => fileResizer.classList.remove('dragging'));
let deleteTarget = '';
document.querySelector('#headerMore').addEventListener('click', () => document.querySelector('#headerMenu').classList.toggle('hidden'));
function requestDelete(target) { deleteTarget = target; document.querySelector('#deleteMessage').textContent = target === 'chapter' ? '将删除当前章节及其提示词文件。此操作无法在原型中恢复。' : '将删除当前小说及其全部章节、知识库和提示词文件。此操作无法在原型中恢复。'; document.querySelector('#headerMenu').classList.add('hidden'); document.querySelector('#deleteModal').classList.remove('hidden'); }
document.querySelector('#deleteChapter').addEventListener('click', () => requestDelete('chapter'));
document.querySelector('#deleteProject').addEventListener('click', () => requestDelete('project'));
document.querySelector('#deleteForm').addEventListener('submit', event => { event.preventDefault(); document.querySelector('#deleteModal').classList.add('hidden'); showToast(deleteTarget === 'chapter' ? '已删除当前章节（原型模拟）' : deleteTarget === 'asset' ? '已删除文件（原型模拟）' : '已删除当前小说（原型模拟）'); });
document.querySelector('#deleteCurrentFile').addEventListener('click', () => { deleteTarget = 'asset'; document.querySelector('#deleteMessage').textContent = `将删除当前文件 ${currentFile}。此操作无法在原型中恢复。`; document.querySelector('#deleteModal').classList.remove('hidden'); });
document.querySelector('#modifyInChat').addEventListener('click', () => { openGenerationPrompt(currentFile, '当前文件', '修改'); showToast(`本次生成：${currentFile}`); });
document.querySelector('.asset-panels').addEventListener('click', event => { const toggle = event.target.closest('.asset-toggle'); if (toggle) { const actions = toggle.parentElement.querySelector('.asset-actions'); actions.classList.toggle('hidden'); return; } const action = event.target.closest('[data-asset-action]'); if (!action) return; const item = action.closest('.asset-item'); const asset = item.querySelector('.asset-toggle'); const name = asset.dataset.asset; const group = asset.dataset.group; if (action.dataset.assetAction === 'view') { openFile(name); document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('active', button.dataset.group === group)); renderFiles(group); } if (action.dataset.assetAction === 'modify') { const input = document.querySelector('#prompt'); input.value = `请修改文件：${group}/${name}\n\n`; input.focus(); showToast('已将文件位置添加到对话框'); } if (action.dataset.assetAction === 'create') { showToast(`已新建${name}（原型模拟）`); } if (action.dataset.assetAction === 'delete') { deleteTarget = 'asset'; document.querySelector('#deleteMessage').textContent = `将删除 ${name}。此操作无法在原型中恢复。`; document.querySelector('#deleteModal').classList.remove('hidden'); } });
document.querySelector('.header-assets').addEventListener('click', event => { const toggle = event.target.closest('.header-asset-toggle'); if (toggle) { toggle.parentElement.querySelector('.header-asset-actions').classList.toggle('hidden'); return; } const action = event.target.closest('[data-header-asset-action]'); if (!action) return; const item = action.closest('.header-asset'); const asset = item.querySelector('.header-asset-toggle'); const name = asset.dataset.asset; const group = asset.dataset.group; if (action.dataset.headerAssetAction === 'view') { openFile(name); document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('active', button.dataset.group === group)); renderFiles(group); } if (action.dataset.headerAssetAction === 'modify') { const input = document.querySelector('#prompt'); input.value = `请修改全局文件：${group}/${name}\n\n`; input.focus(); showToast('已将全局文件位置添加到对话框'); } if (action.dataset.headerAssetAction === 'create') showToast(`已新建${name}（原型模拟）`); if (action.dataset.headerAssetAction === 'delete') { deleteTarget = 'asset'; document.querySelector('#deleteMessage').textContent = `将删除全局文件 ${name}。此操作无法在原型中恢复。`; document.querySelector('#deleteModal').classList.remove('hidden'); } });
renderFiles('正文'); openFile('第 3 章.txt');

/* 顶部：本章已完成项 + 全局资产。 */
const topAssets = document.querySelector('.header-assets');
const makeTopAsset = (name, group, label) => `<div class="header-asset"><button class="header-asset-toggle" type="button" data-asset="${name}" data-group="${group}">${label} <span>⌄</span></button><div class="header-asset-actions hidden"><button data-header-asset-action="view">查看</button><button data-header-asset-action="modify">修改</button><button data-header-asset-action="create">新建</button><button data-header-asset-action="delete">删除</button></div></div>`;
topAssets.insertAdjacentHTML('afterbegin', `${makeTopAsset('强制设定锚点.md', '提示词', '锚点')}${makeTopAsset('配置.md', '提示词', '配置')}${makeTopAsset('台词.md', '提示词', '台词')}${makeTopAsset('第 3 章.txt', '正文', '正文')}${makeTopAsset('校验报告.md', '提示词', '校验报告')}`);
topAssets.insertAdjacentHTML('beforeend', `${makeTopAsset('语言风格.md', '知识库', '语言风格')}${makeTopAsset('剧情书.md', '剧情', '剧情书')}${makeTopAsset('信息卡.md', '知识库', '信息卡')}${makeTopAsset('信息账本.md', '知识库', '信息账本')}`);

/* 当前小说管理：菜单放在左侧小说名称后的三点中。 */
const currentProject = document.querySelector('.project.active');
currentProject.insertAdjacentHTML('beforebegin', '<div class="current-project-row"></div>');
const currentProjectRow = document.querySelector('.current-project-row');
currentProjectRow.append(currentProject);
currentProjectRow.insertAdjacentHTML('beforeend', '<div class="current-project-menu-wrap"><button class="current-project-more" id="currentProjectMore" type="button" aria-label="当前小说操作">•••</button><div class="current-project-menu hidden" id="currentProjectMenu"><button type="button" data-project-action="rename">重命名</button><button type="button" data-project-action="upload">上传</button><button class="danger-action" type="button" data-project-action="delete">删除</button></div></div>');
document.querySelector('#currentProjectMore').addEventListener('click', () => document.querySelector('#currentProjectMenu').classList.toggle('hidden'));
document.querySelector('#currentProjectMenu').addEventListener('click', event => { const action = event.target.dataset.projectAction; if (!action) return; document.querySelector('#currentProjectMenu').classList.add('hidden'); if (action === 'rename') showToast('重命名入口已打开（原型模拟）'); if (action === 'upload') showToast('上传入口已打开（原型模拟）'); if (action === 'delete') requestDelete('project'); });
document.querySelector('#deleteProject').remove();

/* 同人新建：必须选择原著文件后才允许创建。 */
const projectForm = document.querySelector('#projectForm');
document.querySelector('.project-name-label').insertAdjacentHTML('afterend', '<label class="fan-source hidden" id="fanSource">上传原著文件<input type="file" id="sourceFile" accept=".txt,.md,.doc,.docx" /></label>');
document.querySelectorAll('input[name="projectType"]').forEach(input => input.addEventListener('change', () => document.querySelector('#fanSource').classList.toggle('hidden', input.value !== '同人' || !input.checked)));
projectForm.addEventListener('submit', event => { const type = document.querySelector('input[name="projectType"]:checked').value; const source = document.querySelector('#sourceFile'); if (type === '同人' && !source.files.length) { event.preventDefault(); event.stopImmediatePropagation(); showToast('同人小说需要先上传原著文件'); } }, true);

/* 顶部两行默认收起：全局资产与本章已完成。 */
const stageContext = document.querySelector('.stage-context');
const workflowPanel = stageContext.querySelector('.workflow-panel');
const completedNodes = Array.from(topAssets.children).slice(0, 5);
const completedAssets = document.createElement('div');
completedAssets.className = 'header-assets';
completedNodes.forEach(node => completedAssets.append(node));
const topRows = document.createElement('div');
topRows.id = 'topAssetRows';
topRows.className = 'top-asset-rows hidden';
Array.from(topAssets.querySelectorAll('.header-asset')).forEach(item => {
  const button = item.querySelector('.header-asset-toggle');
  const label = button.childNodes[0].textContent.trim();
  button.className = 'updatable-asset';
  button.textContent = label;
  item.querySelector('.header-asset-actions').remove();
});
topAssets.addEventListener('click', event => {
  const asset = event.target.closest('.updatable-asset');
  if (!asset) return;
  openGenerationPrompt(asset.dataset.asset, asset.dataset.group, '生成或更新', asset.textContent.trim());
  showToast(`本次生成：${asset.textContent.trim()}`);
});
const globalRow = document.createElement('div');
globalRow.className = 'top-asset-row';
globalRow.innerHTML = '<span class="top-asset-label">可更新</span>';
const completedRow = document.createElement('div');
completedRow.className = 'top-asset-row';
completedRow.innerHTML = '<span class="top-asset-label">已完成</span>';
globalRow.append(topAssets);
completedRow.append(completedAssets);
topRows.append(globalRow, completedRow);
stageContext.before(topRows);
document.querySelector('#topRowsToggle').addEventListener('click', () => { const open = topRows.classList.toggle('hidden'); document.querySelector('#topRowsToggle').classList.toggle('expanded', !open); document.querySelector('#topRowsToggle').setAttribute('aria-label', open ? '展开顶部资产' : '收起顶部资产'); });
completedAssets.addEventListener('click', event => { const toggle = event.target.closest('.header-asset-toggle'); if (toggle) { toggle.parentElement.querySelector('.header-asset-actions').classList.toggle('hidden'); return; } const action = event.target.closest('[data-header-asset-action]'); if (!action) return; const item = action.closest('.header-asset'); const asset = item.querySelector('.header-asset-toggle'); const name = asset.dataset.asset; const group = asset.dataset.group; if (action.dataset.headerAssetAction === 'view') { openFile(name); document.querySelectorAll('[data-group]').forEach(button => button.classList.toggle('active', button.dataset.group === group)); renderFiles(group); } if (action.dataset.headerAssetAction === 'modify') { openGenerationPrompt(name, group, '修改'); showToast(`本次生成：${name}`); } if (action.dataset.headerAssetAction === 'create') { openGenerationPrompt(name, group, '新建'); showToast(`本次生成：${name}`); } if (action.dataset.headerAssetAction === 'delete') { deleteTarget = 'asset'; document.querySelector('#deleteMessage').textContent = `将删除文件 ${name}。此操作无法在原型中恢复。`; document.querySelector('#deleteModal').classList.remove('hidden'); } });

/* 新项目流程：在保留原型全部交互的前提下，为新建项目提供独立的前端状态。 */
(() => {
  const emptyProjectFiles = () => ({ "正文": [], "提示词": [], "知识库": [], "剧情": [], "提取": [] });
  const newProjectStore = new Map();
  let activeNewProject = null;
  const initBase = [
    { name: '知识库', next: '下一步：生成剧情资产', message: '知识库已生成：世界观、语言风格、角色卡与关系卡。', outputs: [['知识库', '世界观.md'], ['知识库', '语言风格.md'], ['知识库', '角色卡.md'], ['知识库', '关系卡.md']] },
    { name: '剧情资产', next: '完成初始化', message: '剧情书、剧情卷 N 与信息账本已生成。', outputs: [['剧情', '剧情书.md'], ['剧情', '第 1 卷.md'], ['知识库', '信息账本.md']] },
    { name: '确认初始化', next: '完成初始化', message: '初始化资产已齐全。完成后才可以新建章节。', outputs: [] }
  ];
  const initFan = [{ name: '同人提取', next: '下一步：生成知识库', message: '已生成原文统计、原文风格、高频词、正向词库与原文检索索引。', outputs: [['提取', '原文统计.md'], ['提取', '原文风格.md'], ['提取', '高频词.md'], ['提取', '正向词库.md'], ['提取', '原文检索索引.md']] }, ...initBase];
  const chapterFlow = [
    { name: '设定', next: '下一步：生成配置', message: '本章强制设定锚点已生成。', file: '强制设定锚点.md', group: '提示词' },
    { name: '配置', next: '下一步：生成台词', message: '本章配置已生成。', file: '配置.md', group: '提示词' },
    { name: '台词', next: '下一步：生成提示词', message: '本章台词已生成。', file: '台词.md', group: '提示词' },
    { name: '提示词', next: '下一步：生成正文', message: '最终提示词快照已生成，正文将只使用该快照。', file: '最终提示词快照.md', group: '提示词' },
    { name: '正文', next: '下一步：校验与验收', message: '正文已生成，进入校验与验收。', group: '正文' },
    { name: '校验与验收', next: '生成校验报告', message: '校验报告已生成。请查看后选择撤回、重试、通过或上一步。', file: '校验报告.md', group: '提示词' }
  ];
  const managed = () => activeNewProject && newProjectStore.get(activeNewProject);
  const currentInitStages = project => project.type === '同人' ? initFan : initBase;
  const uniquePush = (list, item) => { if (!list.includes(item)) list.push(item); };
  function syncProjectFiles(project) {
    Object.entries(files).forEach(([group, list]) => list.splice(0, list.length, ...project.files[group]));
    Object.keys(fileState).forEach(key => delete fileState[key]);
    Object.assign(fileState, project.fileState);
    openFiles = []; currentFile = '';
    content.value = ''; path.textContent = '当前文件 / 未选择'; renderTabs(); renderFiles(project.activeGroup || '知识库');
  }
  function activeChapter(project) { return project.chapters.find(chapter => chapter.id === project.chapterId) || null; }
  function setHeader(project) {
    let title = '初始化', label = '', next = '';
    if (!project.initialized) { const stage = currentInitStages(project)[project.initIndex]; label = stage.name; next = stage.next; }
    else if (!project.chapterId) { title = '准备新章节'; label = '初始化已完成'; next = '新建第 1 章'; }
    else {
      const chapter = activeChapter(project); title = chapter.name;
      if (chapter.approved) { label = '已通过'; next = `新建第 ${project.chapters.length + 1} 章`; }
      else { const stage = chapterFlow[chapter.stageIndex]; label = stage.name; next = chapter.evaluated ? '上一步' : stage.next; }
    }
    document.querySelector('.eyebrow').textContent = `${project.name} /`;
    document.querySelector('.chat-title h1').textContent = title;
    document.querySelector('.workflow').innerHTML = `<span class="status-dot"></span>当前阶段：${label}`;
    document.querySelector('#nextStep').innerHTML = `${next} <span>›</span>`;
  }
  function addOtherProjectButton(project) {
    const exists = [...document.querySelectorAll('.project[data-new-project]')].some(button => button.dataset.newProject === project.id);
    if (exists) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'project'; button.dataset.newProject = project.id;
    button.innerHTML = `<span class="project-dot"></span><span>${project.name}</span><span class="count">00</span>`;
    document.querySelector('.other-projects').after(button);
    button.addEventListener('click', () => selectNewProject(project.id));
  }
  function selectNewProject(id) {
    const nextProject = newProjectStore.get(id); if (!nextProject) return;
    const previous = managed(); if (previous && previous.id !== id) addOtherProjectButton(previous);
    activeNewProject = id;
    const currentButton = document.querySelector('.current-project-row .project');
    currentButton.querySelector('span:nth-child(2)').textContent = nextProject.name;
    currentButton.querySelector('.count').textContent = String(nextProject.chapters.length).padStart(2, '0');
    document.querySelectorAll('.project[data-new-project]').forEach(button => button.classList.toggle('active', button.dataset.newProject === id));
    syncProjectFiles(nextProject); setHeader(nextProject); renderManagedChapterMenu(nextProject);
  }
  function renderManagedChapterMenu(project) {
    const picker = document.querySelector('#chapterPicker');
    const menu = document.querySelector('#chapterMenu');
    picker.childNodes[0].nodeValue = `${project.initialized ? (project.chapterId ? activeChapter(project).name : '准备新章节') : '初始化'} `;
    menu.innerHTML = project.initialized ? `${project.chapters.map(chapter => `<button type="button" data-managed-chapter="${chapter.id}">${chapter.name}</button>`).join('')}<button type="button" class="create-chapter" data-managed-create>＋ 新建章节</button>` : '<button type="button" data-managed-init>初始化</button><button type="button" class="create-chapter" data-managed-create>＋ 新建章节</button>';
  }
  function appendManagedResult(stage, validation = false) {
    const file = stage.file || (stage.group === '正文' ? `${activeChapter(managed()).name}.txt` : stage.outputs?.[0]?.[1]);
    const group = stage.group || stage.outputs?.[0]?.[0];
    const actions = validation ? '<button type="button" data-managed-action="undo">撤回</button><button type="button" data-managed-action="retry">重试</button><button type="button" class="confirmed" data-managed-action="pass">通过</button><button type="button" data-managed-action="previous">上一步</button>' : '<button type="button" data-managed-action="next">下一步</button>';
    messages.insertAdjacentHTML('beforeend', `<article class="message assistant-message completion"><div class="avatar">AI</div><div><p>${stage.message}</p>${file ? `<button class="generated-file" type="button" data-file="${file}" data-managed-group="${group}"><span class="done-icon">✓</span> 已生成 <strong>${file}</strong><span class="open-arrow">打开 ›</span></button>` : ''}<div class="message-actions">${actions}</div></div></article>`);
    messages.scrollTop = messages.scrollHeight;
  }
  function completeInitialization(project) {
    const stages = currentInitStages(project); const stage = stages[project.initIndex];
    stage.outputs.forEach(([group, file]) => { uniquePush(project.files[group], file); project.fileState[file] = `# ${file.replace('.md', '')}\n\n初始化阶段已生成，等待编辑或补充。`; });
    appendManagedResult(stage); project.initIndex += 1;
    if (project.initIndex >= stages.length) { project.initialized = true; project.activeGroup = '知识库'; appendManagedResult({ message: '初始化已完成。现在可以新建章节。' }); }
    syncProjectFiles(project); setHeader(project); renderManagedChapterMenu(project);
  }
  function completeChapterStep(project) {
    const chapter = activeChapter(project); const stage = chapterFlow[chapter.stageIndex];
    const file = stage.file || `${chapter.name}.txt`; uniquePush(project.files[stage.group], file);
    project.fileState[file] = `# ${file.replace(/\.(md|txt)$/, '')}\n\n此产物由“${stage.name}”步骤生成。`;
    appendManagedResult({ ...stage, file }, chapter.stageIndex === chapterFlow.length - 1);
    if (chapter.stageIndex < chapterFlow.length - 1) chapter.stageIndex += 1; else chapter.evaluated = true;
    syncProjectFiles(project); setHeader(project); renderManagedChapterMenu(project);
  }
  function openManagedChapterModal(project) {
    if (!project.initialized) return showToast('请先完成初始化，再新建章节');
    const number = project.chapters.length + 1;
    document.querySelector('#chapterModal .modal-title strong').textContent = `新建第 ${number} 章`;
    document.querySelector('#chapterModal .form-note').textContent = `将创建第 ${number} 章，并从“设定”开始生成。`;
    document.querySelector('#chapterName').placeholder = `例如：第 ${number} 章：未命名`;
    document.querySelector('#chapterModal').classList.remove('hidden'); document.querySelector('#chapterName').focus();
  }
  function createManagedChapter(project, name) {
    const chapter = { id: crypto.randomUUID(), name, stageIndex: 0, evaluated: false, approved: false };
    project.chapters.push(chapter); project.chapterId = chapter.id; project.activeGroup = '提示词';
    messages.innerHTML = `<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${name}。请从本章设定开始。</p></div></article>`;
    syncProjectFiles(project); setHeader(project); renderManagedChapterMenu(project);
  }
  function managedNext(project) {
    if (!project.initialized) return completeInitialization(project);
    if (!project.chapterId || activeChapter(project).approved) return openManagedChapterModal(project);
    const chapter = activeChapter(project); if (chapter.evaluated) { chapter.stageIndex = Math.max(0, chapter.stageIndex - 1); chapter.evaluated = false; setHeader(project); return; }
    completeChapterStep(project);
  }
  projectForm.addEventListener('submit', event => {
    const name = document.querySelector('#projectName').value.trim(); const type = document.querySelector('input[name="projectType"]:checked').value; const source = document.querySelector('#sourceFile');
    if (!name || (type === '同人' && !source.files.length)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const previous = managed(); if (previous) addOtherProjectButton(previous);
    const project = { id: crypto.randomUUID(), name: `${type}-${name}`, type, initialized: false, initIndex: 0, files: emptyProjectFiles(), fileState: {}, chapters: [], chapterId: null, activeGroup: type === '同人' ? '提取' : '知识库' };
    newProjectStore.set(project.id, project); activeNewProject = project.id;
    document.querySelector('.current-project-row .project span:nth-child(2)').textContent = project.name;
    document.querySelector('.current-project-row .project .count').textContent = '00';
    document.querySelector('#projectModal').classList.add('hidden'); event.target.reset();
    messages.innerHTML = `<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${project.name}。请先完成初始化，再新建章节。</p></div></article>`;
    syncProjectFiles(project); setHeader(project); renderManagedChapterMenu(project);
  }, true);
  document.querySelector('#nextStep').addEventListener('click', event => { const project = managed(); if (!project) return; event.preventDefault(); event.stopImmediatePropagation(); managedNext(project); }, true);
  document.querySelector('#chapterMenu').addEventListener('click', event => {
    const project = managed(); const button = event.target.closest('button'); if (!project || !button) return;
    if (button.dataset.managedCreate !== undefined) { event.preventDefault(); event.stopImmediatePropagation(); openManagedChapterModal(project); }
    if (button.dataset.managedChapter) { event.preventDefault(); event.stopImmediatePropagation(); project.chapterId = button.dataset.managedChapter; syncProjectFiles(project); setHeader(project); renderManagedChapterMenu(project); }
    if (button.dataset.managedInit !== undefined) { event.preventDefault(); event.stopImmediatePropagation(); showToast('请完成初始化流程'); }
  }, true);
  document.querySelector('#chapterForm').addEventListener('submit', event => {
    const project = managed(); if (!project) return; const name = document.querySelector('#chapterName').value.trim(); if (!name) return;
    event.preventDefault(); event.stopImmediatePropagation(); document.querySelector('#chapterModal').classList.add('hidden'); event.target.reset(); createManagedChapter(project, name);
  }, true);
  messages.addEventListener('click', event => {
    const project = managed(); const action = event.target.closest('[data-managed-action]'); const file = event.target.closest('[data-managed-group]'); if (!project || (!action && !file)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (file) { project.activeGroup = file.dataset.managedGroup; syncProjectFiles(project); openFile(file.dataset.file); return; }
    const chapter = activeChapter(project); const type = action.dataset.managedAction;
    if (type === 'undo') { action.closest('.completion').remove(); showToast('已撤回本次生成'); }
    if (type === 'retry') { action.closest('.completion').querySelector('p').textContent = '已重新生成，可打开文件查看新版本。'; }
    if (type === 'next') managedNext(project);
    if (type === 'previous') { chapter.stageIndex = Math.max(0, chapter.stageIndex - 1); chapter.evaluated = false; setHeader(project); }
    if (type === 'pass') { chapter.approved = true; appendManagedResult({ message: '验收已通过：已更新剧情卷、世界观、语言风格、角色卡、关系卡与信息账本。' }); setHeader(project); renderManagedChapterMenu(project); }
  }, true);
})();
