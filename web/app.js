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
function clearPastStepActions() { document.querySelectorAll('#messages .completion .message-actions').forEach(actions => actions.remove()); }

document.querySelector('#fileGroups').addEventListener('click', event => { const button = event.target.closest('button[data-group]'); if (!button) return; document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item === button)); renderFiles(button.dataset.group); });
fileList.addEventListener('click', event => { const row = event.target.closest('[data-file]'); if (row) openFile(row.dataset.file); });
documentTabs.addEventListener('click', event => { const close = event.target.closest('[data-close]'); if (close) { const name = close.dataset.close; openFiles = openFiles.filter(file => file !== name); if (!openFiles.length) openFiles = ["第 3 章.txt"]; if (currentFile === name) currentFile = openFiles[openFiles.length - 1]; openFile(currentFile); return; } const tab = event.target.closest('[data-tab]'); if (tab) openFile(tab.dataset.tab); });
editButton.addEventListener('click', () => { if (!editing) { editStartValue = content.value; setEditorMode(true); setGenerationTarget(currentFile); content.focus(); showToast(`本次生成：${currentFile}`); return; } fileState[currentFile] = content.value; document.dispatchEvent(new CustomEvent('novel:file-saved', { detail:{ name:currentFile, value:content.value } })); setEditorMode(false); footer.textContent = '已保存'; showToast(`${currentFile} 已保存`); });
document.querySelector('#undoEdit').addEventListener('click', () => { content.value = editStartValue; footer.textContent = '已撤回至开始编辑时的内容'; });
document.querySelector('#cancelEdit').addEventListener('click', () => { content.value = editStartValue; setEditorMode(false); showToast('已取消编辑，未保存修改已放弃'); });
document.querySelector('#chapterPicker').addEventListener('click', () => document.querySelector('#chapterMenu').classList.toggle('hidden'));
document.querySelector('#chapterMenu').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.id === 'createChapter') { document.querySelector('#chapterModal').classList.remove('hidden'); document.querySelector('#chapterName').focus(); } else { document.querySelector('#chapterPicker').childNodes[0].nodeValue = `${button.dataset.chapter} `; showToast(`已切换至${button.dataset.chapter}`); } document.querySelector('#chapterMenu').classList.add('hidden'); });
document.querySelector('#newProject').addEventListener('click', () => { document.querySelector('#projectModal').classList.remove('hidden'); document.querySelector('#projectName').focus(); }); document.querySelector('#settings').addEventListener('click', () => showToast('设置面板将在左下角展开')); 
document.querySelectorAll('.generated-file').forEach(button => button.addEventListener('click', () => { openFile(button.dataset.file); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === '提示词')); renderFiles('提示词'); }));
document.querySelector('#composer').addEventListener('submit', event => { event.preventDefault(); const input = document.querySelector('#prompt'); const text = input.value.trim(); if (!text) return; const messages = document.querySelector('#messages'); const target = document.querySelector('#generationTarget').textContent; const targetFile = document.querySelector('#generationContext').dataset.file; clearPastStepActions(); messages.insertAdjacentHTML('beforeend', `<article class="message user-message"><div><p>${text.replace(/</g, '&lt;')}</p></div></article><article class="message assistant-message completion"><div class="avatar">AI</div><div><p>操作已完成。已生成文件，可在右侧打开查看。</p><button class="generated-file" type="button" data-file="${targetFile}"><span class="done-icon">✓</span> 已生成 <strong>${target}</strong><span class="open-arrow">打开 ›</span></button><div class="message-actions"><button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" data-action="next">下一步</button></div></div></article>`); input.value = ''; autoGrowComposer(); messages.scrollTop = messages.scrollHeight; });
document.querySelector('#prompt').addEventListener('input', autoGrowComposer);
document.querySelector('#writeModeButton').addEventListener('click', () => { const menu = document.querySelector('#writeModeMenu'); const hidden = menu.classList.toggle('hidden'); document.querySelector('#writeModeButton').setAttribute('aria-expanded', String(!hidden)); });
document.querySelector('#writeModeMenu').addEventListener('click', event => { const option = event.target.closest('[data-write-mode]'); if (!option) return; document.querySelector('#writeModeLabel').textContent = option.dataset.writeMode; document.querySelectorAll('[data-write-mode]').forEach(button => button.setAttribute('aria-selected', String(button === option))); document.querySelector('#writeModeMenu').classList.add('hidden'); document.querySelector('#writeModeButton').setAttribute('aria-expanded', 'false'); });
document.querySelector('#messages').addEventListener('click', event => { const file = event.target.closest('.generated-file'); if (file) { openFile(file.dataset.file); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === '提示词')); renderFiles('提示词'); return; } const action = event.target.closest('[data-action]'); if (!action) return; const card = action.closest('.completion'); if (action.dataset.action === 'undo') { card.remove(); showToast('已撤回本次生成'); } if (action.dataset.action === 'retry') { card.querySelector('p').textContent = '已重新生成，可打开文件查看新版本。'; showToast('已重新生成'); } if (action.dataset.action === 'next') advanceFlow(); if (action.dataset.action === 'previous') returnToProse(); if (action.dataset.action === 'pass') { clearPastStepActions(); validationPassed = true; updatePhaseHeader(); showToast('本章已通过验收，可以进入下一章'); } });
document.querySelector('#projectForm').addEventListener('submit', event => { event.preventDefault(); const name = document.querySelector('#projectName').value.trim(); const type = document.querySelector('input[name="projectType"]:checked').value; if (!name) return; const project = document.createElement('button'); project.type = 'button'; project.className = 'project'; project.innerHTML = `<span class="project-dot"></span><span>${type}-${name}</span><span class="count">01</span>`; document.querySelector('.other-projects').after(project); document.querySelector('#projectModal').classList.add('hidden'); event.target.reset(); showToast(`已创建${type}-${name}`); });
document.querySelector('#chapterForm').addEventListener('submit', event => { event.preventDefault(); const name = document.querySelector('#chapterName').value.trim(); if (!name) return; files['正文'].unshift(`${name}.txt`); document.querySelector('#chapterPicker').childNodes[0].nodeValue = `${name} `; document.querySelector('#chapterModal').classList.add('hidden'); event.target.reset(); renderFiles('正文'); showToast(`已创建${name}及提示词文件`); });
document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeModal}`).classList.add('hidden')));
document.querySelector('.search-button').addEventListener('click', () => { document.querySelector('#searchPanel').classList.remove('hidden'); document.querySelector('#searchInput').focus(); });
document.querySelector('#closeSearch').addEventListener('click', () => document.querySelector('#searchPanel').classList.add('hidden'));
document.querySelector('#searchForm').addEventListener('submit', event => { event.preventDefault(); const q = document.querySelector('#searchInput').value.trim().toLowerCase(); const results = Object.entries(files).flatMap(([group, names]) => names.filter(name => name.toLowerCase().includes(q)).map(name => ({ group, name }))); document.querySelector('#searchResults').innerHTML = q ? (results.length ? results.map(item => `<button class="search-result" type="button" data-result="${item.name}" data-result-group="${item.group}">${item.group} / ${item.name}</button>`).join('') : '<span>没有匹配的文件</span>') : '<span>请输入关键词后点击“查找”</span>'; });
document.querySelector('#searchResults').addEventListener('click', event => { const result = event.target.closest('[data-result]'); if (!result) return; openFile(result.dataset.result); document.querySelector('#searchPanel').classList.add('hidden'); document.querySelectorAll('[data-group]').forEach(item => item.classList.toggle('active', item.dataset.group === result.dataset.resultGroup)); renderFiles(result.dataset.resultGroup); });
const resizer = document.querySelector('#workspaceResizer'); resizer.addEventListener('pointerdown', event => { resizer.classList.add('dragging'); resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', event => { if (!resizer.classList.contains('dragging')) return; const width = Math.max(360, Math.min(700, window.innerWidth - event.clientX)); document.querySelector('.app-shell').style.setProperty('--workspace-width', `${width}px`); }); resizer.addEventListener('pointerup', () => resizer.classList.remove('dragging'));
let phaseIndex = 0;
let validationPassed = false;
const phases = [
  { name: '台词', next: '下一步：生成正文', message: '已进入正文阶段，并准备好本章生成材料。', file: '第 3 章.txt', label: '正文草稿' },
  { name: '正文', next: '下一步：校验与验收', message: '正文已生成，已进入校验与验收阶段。', file: '校验报告.md', label: '校验报告' },
  { name: '验收', next: '上一步', message: '', file: '', label: '' }
];
function updatePhaseHeader() { const phase = phases[phaseIndex]; const next = phaseIndex === 2 && validationPassed ? '下一章：第 4 章' : phase.next; document.querySelector('.workflow').innerHTML = `<span class="status-dot"></span>当前阶段：${phase.name}`; document.querySelector('#nextStep').innerHTML = `${next} <span>›</span>`; }
function returnToProse() { const prose = phases[0]; clearPastStepActions(); phaseIndex = 1; validationPassed = false; messages.insertAdjacentHTML('beforeend', `<article class="message assistant-message completion"><div class="avatar">AI</div><div><p>${prose.message}</p><button class="generated-file" type="button" data-file="${prose.file}"><span class="done-icon">✓</span> 已生成 <strong>${prose.label}</strong><span class="open-arrow">打开 ›</span></button><div class="message-actions"><button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" data-action="next">下一步</button></div></div></article>`); updatePhaseHeader(); messages.scrollTop = messages.scrollHeight; showToast('已返回正文阶段'); }
function advanceFlow() { if (phaseIndex === 2) { if (!validationPassed) returnToProse(); else { document.querySelector('#chapterPicker').childNodes[0].nodeValue = '第 4 章：未命名 '; document.querySelector('.chat-title h1').textContent = '第 4 章：未命名'; phaseIndex = 0; validationPassed = false; updatePhaseHeader(); showToast('已跳转到第 4 章'); } return; } const phase = phases[phaseIndex]; phaseIndex += 1; const actions = phaseIndex === 2 ? '<button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" class="confirmed" data-action="pass">通过</button><button type="button" data-action="previous">上一步</button>' : '<button type="button" data-action="undo">撤回</button><button type="button" data-action="retry">重试</button><button type="button" data-action="next">下一步</button>'; const messages = document.querySelector('#messages'); clearPastStepActions(); messages.insertAdjacentHTML('beforeend', `<article class="message assistant-message completion"><div class="avatar">AI</div><div><p>${phase.message}</p><button class="generated-file" type="button" data-file="${phase.file}"><span class="done-icon">✓</span> 已生成 <strong>${phase.label}</strong><span class="open-arrow">打开 ›</span></button><div class="message-actions">${actions}</div></div></article>`); updatePhaseHeader(); messages.scrollTop = messages.scrollHeight; showToast(`已进入${phases[phaseIndex].name}阶段`); }
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

/* 新建项目专用：不替换原有交互；只有新项目进入初始化状态。 */
(() => {
  const groups = ["正文", "提示词", "知识库", "剧情", "提取"];
  const blankFiles = () => Object.fromEntries(groups.map(group => [group, []]));
  const projects = new Map();
  let activeId = null;
  const legacy = { name: document.querySelector('.current-project-row .project span:nth-child(2)').textContent, files: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, [...value]])), content: { ...fileState } };
  let legacyButtonAdded = false;
  const initCommon = [
    { name:'世界观', next:'下一步：生成语言风格', output:[['知识库','世界观.md']] },
    { name:'语言风格', next:'下一步：生成角色卡', output:[['知识库','语言风格.md']] },
    { name:'角色卡', next:'下一步：生成关系卡', output:[['知识库','角色卡.md']] },
    { name:'关系卡', next:'下一步：生成剧情书', output:[['知识库','关系卡.md']] },
    { name:'剧情书', next:'下一步：生成剧情卷 N', output:[['剧情','剧情书.md']], optional:true },
    { name:'剧情卷 N', next:'下一步：生成信息账本', output:[['剧情','第 1 卷.md']], optional:true },
    { name:'信息账本', next:'完成初始化', output:[['知识库','信息账本.md']], optional:true },
    { name:'确认初始化', next:'完成初始化', output:[] }
  ];
  const initFan = [{ name:'同人提取', next:'下一步：生成知识库', output:[['提取','原文统计.md'],['提取','原文风格.md'],['提取','高频词.md'],['提取','正向词库.md'],['提取','原文检索索引.md']] }, ...initCommon];
  const chapterFlow = [
    { name:'设定', next:'下一步：生成配置', file:'强制设定锚点.md', group:'提示词' }, { name:'配置', next:'下一步：生成台词', file:'配置.md', group:'提示词' }, { name:'台词', next:'下一步：生成提示词', file:'台词.md', group:'提示词' }, { name:'提示词', next:'下一步：生成正文', file:'最终提示词快照.md', group:'提示词' }, { name:'正文', next:'下一步：校验与验收', group:'正文' }, { name:'校验与验收', next:'生成校验报告', file:'校验报告.md', group:'提示词' }
  ];
  const active = () => activeId ? projects.get(activeId) : null;
  const stages = project => project.type === '同人' ? initFan : initCommon;
  const chapter = project => project.chapters.find(item => item.id === project.chapterId);
  const add = (project, group, name) => { if (!project.files[group].includes(name)) project.files[group].push(name); };
  function localPath(project, name) {
    if (project.paths?.[name]) return project.paths[name];
    if (name === '世界观.md' || name === '语言风格.md' || name === '信息账本.md') return `知识库/${name}`;
    if (name.includes('角色卡')) return `知识库/角色卡/${name}`;
    if (name.includes('关系卡')) return `知识库/关系卡/${name}`;
    if (name === '剧情书.md') return `剧情/${name}`;
    if (name.includes('卷')) return `剧情/剧情卷/${name}`;
    if (['强制设定锚点.md','配置.md','台词.md','最终提示词快照.md','校验报告.md'].includes(name)) return `提示词/${chapter(project)?.name || '未命名章节'}/${name}`;
    if (name.endsWith('.txt')) return `正文/${name}`;
    return `提取/${name}`;
  }
  async function persist(project, name, value) {
    if (!project.diskName) return;
    const path = localPath(project, name);
    project.paths ||= {};
    project.paths[name] = path;
    try {
      const response = await fetch('/api/file', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ project:project.diskName, path, content:value }) });
      if (!response.ok) throw new Error((await response.json()).error || '保存失败');
    } catch (error) { showToast(`本地保存失败：${error.message}`); }
  }
  function sync(project, group = project.group) { Object.entries(files).forEach(([key, value]) => value.splice(0, value.length, ...project.files[key])); Object.keys(fileState).forEach(key => delete fileState[key]); Object.assign(fileState, project.content); openFiles=[]; currentFile=''; content.value=''; path.textContent='当前文件 / 未选择'; renderTabs(); renderFiles(group); }
  function header(project) { let title='初始化', stage, next; if (!project.initialized) { stage=stages(project)[project.initIndex]; next=stage.next; } else if (!project.chapterId) { title='准备新章节'; stage={name:'初始化已完成'}; next='新建第1章'; } else { const item=chapter(project); title=item.name; stage=item.approved ? {name:'已通过'} : chapterFlow[item.index]; next=item.approved ? `新建第${project.chapters.length + 1}章` : item.checked ? '上一步' : stage.next; } document.querySelector('.eyebrow').textContent=`${project.name} /`; document.querySelector('.chat-title h1').textContent=title; document.querySelector('.workflow').innerHTML=`<span class="status-dot"></span>当前阶段：${stage.name}`; document.querySelector('#nextStep').innerHTML=`${next} <span>›</span>`; document.querySelector('#initSkip')?.remove(); if (!project.initialized && stage.optional) { const skip=document.createElement('button'); skip.type='button'; skip.id='initSkip'; skip.className='next-step'; skip.textContent=`跳过${stage.name}`; skip.addEventListener('click',()=>runInitialization(project,true)); document.querySelector('.workflow-panel').prepend(skip); } }
  function menu(project) { const picker=document.querySelector('#chapterPicker'), list=document.querySelector('#chapterMenu'); const label=!project.initialized?'初始化':project.chapterId?chapter(project).name:'准备新章节'; picker.childNodes[0].nodeValue=`${label} `; list.innerHTML=!project.initialized?'<button type="button" data-new-init>初始化</button><button type="button" class="create-chapter" data-new-chapter>＋ 新建章节</button>':`${project.chapters.map(item=>`<button type="button" data-new-chapter-id="${item.id}">${item.name}</button>`).join('')}<button type="button" class="create-chapter" data-new-chapter>＋ 新建章节</button>`; }
  function card(text, file, group, validation=false) { const actions=validation?'<button type="button" data-new-action="undo">撤回</button><button type="button" data-new-action="retry">重试</button><button type="button" class="confirmed" data-new-action="pass">通过</button><button type="button" data-new-action="previous">上一步</button>':'<button type="button" data-new-action="undo">撤回</button><button type="button" data-new-action="retry">重试</button><button type="button" data-new-action="next">下一步</button>'; clearPastStepActions(); messages.insertAdjacentHTML('beforeend',`<article class="message assistant-message completion"><div class="avatar">AI</div><div><p>${text}</p>${file?`<button class="generated-file" type="button" data-new-file="${file}" data-new-group="${group}"><span class="done-icon">✓</span> 已生成 <strong>${file}</strong><span class="open-arrow">打开 ›</span></button>`:''}<div class="message-actions">${actions}</div></div></article>`); messages.scrollTop=messages.scrollHeight; }
  function otherButton(name, count, handler) { const button=document.createElement('button'); button.type='button'; button.className='project'; button.innerHTML=`<span class="project-dot"></span><span>${name}</span><span class="count">${String(count).padStart(2,'0')}</span>`; document.querySelector('.other-projects').after(button); button.addEventListener('click',handler); }
  function restoreLegacy() { activeId=null; Object.entries(files).forEach(([key,value])=>value.splice(0,value.length,...legacy.files[key])); Object.keys(fileState).forEach(key=>delete fileState[key]); Object.assign(fileState,legacy.content); document.querySelector('.current-project-row .project span:nth-child(2)').textContent=legacy.name; document.querySelector('.current-project-row .project .count').textContent='03'; document.querySelector('.eyebrow').textContent=`${legacy.name} /`; document.querySelector('.chat-title h1').textContent='第 3 章：旧码头'; document.querySelector('#chapterPicker').childNodes[0].nodeValue='第 3 章：旧码头 '; document.querySelector('#chapterMenu').innerHTML='<button type="button" data-chapter="第 1 章：雨夜来客">第 1 章：雨夜来客</button><button type="button" data-chapter="第 2 章：失物招领">第 2 章：失物招领</button><button type="button" data-chapter="第 3 章：旧码头">第 3 章：旧码头</button><button type="button" class="create-chapter" id="createChapter">＋ 新建章节</button>'; phaseIndex=0; updatePhaseHeader(); renderFiles('正文'); openFile('第 3 章.txt'); }
  function activate(id) { const project=projects.get(id); if (!project) return; activeId=id; document.querySelector('.current-project-row .project span:nth-child(2)').textContent=project.name; document.querySelector('.current-project-row .project .count').textContent=String(project.chapters.length).padStart(2,'0'); sync(project); header(project); menu(project); }
  function runInitialization(project, skipped=false) { const stage=stages(project)[project.initIndex]; if (!skipped) stage.output.forEach(([group,name])=>{add(project,group,name);project.content[name]=`# ${name.replace('.md','')}\n\n初始化阶段已生成。`;persist(project,name,project.content[name]);}); card(skipped ? `已跳过${stage.name}。` : `${stage.name}已完成。`,skipped ? '' : stage.output[0]?.[1],skipped ? '' : stage.output[0]?.[0]); project.initIndex+=1; if(project.initIndex>=stages(project).length){project.initialized=true;card('初始化已完成。现在可以新建章节。');} sync(project);header(project);menu(project); }
  function runChapter(project) { const item=chapter(project), stage=chapterFlow[item.index], file=stage.file||`${item.name}.txt`; add(project,stage.group,file);project.content[file]=`# ${file.replace(/\.(md|txt)$/,'')}\n\n此产物由“${stage.name}”步骤生成。`;persist(project,file,project.content[file]);card(`${stage.name}已生成。`,file,stage.group,item.index===chapterFlow.length-1);if(item.index<chapterFlow.length-1)item.index+=1;else item.checked=true;sync(project,stage.group);header(project);menu(project); }
  function openChapter(project) { if(!project.initialized)return showToast('请先完成初始化，再新建章节');const n=project.chapters.length+1;document.querySelector('#chapterModal .modal-title strong').textContent=`新建第${n}章`;document.querySelector('#chapterModal .form-note').textContent=`将创建第${n}章，并从“设定”开始生成。`;document.querySelector('#chapterName').placeholder=`例如：第${n}章：退婚`;document.querySelector('#chapterModal').classList.remove('hidden');document.querySelector('#chapterName').focus(); }
  projectForm.addEventListener('submit',async event=>{const name=document.querySelector('#projectName').value.trim(),type=document.querySelector('input[name="projectType"]:checked').value,source=document.querySelector('#sourceFile');if(!name||(type==='同人'&&!source.files.length))return;event.preventDefault();event.stopImmediatePropagation();let saved;try{const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,type})});saved=await response.json();if(!response.ok)throw new Error(saved.error||'创建失败');}catch(error){showToast(`本地项目创建失败：${error.message}`);return;}if(!legacyButtonAdded){legacyButtonAdded=true;otherButton(legacy.name,3,restoreLegacy);}const project={id:crypto.randomUUID(),name:saved.project,type,initialized:false,initIndex:0,files:blankFiles(),content:{},paths:{},diskName:saved.project,chapters:[],chapterId:null,group:type==='同人'?'提取':'知识库'};projects.set(project.id,project);document.querySelector('#projectModal').classList.add('hidden');event.target.reset();messages.innerHTML=`<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${project.name}，并保存到本地小说项目文件夹。请先完成初始化，再新建章节。</p></div></article>`;activate(project.id);},true);
  document.querySelector('#nextStep').addEventListener('click',event=>{const project=active();if(!project)return;event.preventDefault();event.stopImmediatePropagation();if(!project.initialized)return runInitialization(project);if(!project.chapterId||chapter(project).approved)return openChapter(project);const item=chapter(project);if(item.checked){item.index=Math.max(0,item.index-1);item.checked=false;header(project);return;}runChapter(project);},true);
  document.querySelector('#chapterMenu').addEventListener('click',event=>{const project=active(),button=event.target.closest('button');if(!project||!button)return;if(button.dataset.newChapter!==undefined){event.preventDefault();event.stopImmediatePropagation();openChapter(project);}if(button.dataset.newChapterId){event.preventDefault();event.stopImmediatePropagation();project.chapterId=button.dataset.newChapterId;sync(project);header(project);menu(project);}if(button.dataset.newInit!==undefined){event.preventDefault();event.stopImmediatePropagation();showToast('请完成初始化流程');}},true);
  document.querySelector('#chapterForm').addEventListener('submit',event=>{const project=active(),name=document.querySelector('#chapterName').value.trim();if(!project||!name)return;event.preventDefault();event.stopImmediatePropagation();const n=project.chapters.length+1;const fullName=/^第\d+章[：:]/.test(name)?name:`第${n}章：${name}`;const item={id:crypto.randomUUID(),name:fullName,index:0,checked:false,approved:false};project.chapters.push(item);project.chapterId=item.id;document.querySelector('#chapterModal').classList.add('hidden');event.target.reset();messages.innerHTML=`<article class="message assistant-message"><div class="avatar">AI</div><div><p>已创建${fullName}。请从本章设定开始。</p></div></article>`;sync(project,'提示词');header(project);menu(project);},true);
  messages.addEventListener('click',event=>{const project=active(),action=event.target.closest('[data-new-action]'),file=event.target.closest('[data-new-file]');if(!project||(!action&&!file))return;event.preventDefault();event.stopImmediatePropagation();if(file){sync(project,file.dataset.newGroup);openFile(file.dataset.newFile);return;}const item=chapter(project),type=action.dataset.newAction;if(type==='undo'){action.closest('.completion').remove();showToast('已撤回本次生成');}if(type==='retry'){action.closest('.completion').querySelector('p').textContent='已重新生成，可打开文件查看新版本。';}if(type==='next')document.querySelector('#nextStep').click();if(type==='previous'){item.index=Math.max(0,item.index-1);item.checked=false;header(project);}if(type==='pass'){item.approved=true;card('验收已通过：已更新剧情卷、世界观、语言风格、角色卡、关系卡与信息账本。');header(project);menu(project);}},true);
  document.addEventListener('novel:file-saved', event => { const project=active(); if (!project) return; const { name, value }=event.detail; project.content[name]=value; persist(project,name,value); });
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
    anchor: { title:'强制设定锚点', fields:[['出场角色与情绪','例如：沈栖迟（戒备）、陆闻洲（克制）','textarea'],['核心事件','本章必须发生的事件','textarea'],['信息边界','可以揭示与禁止揭示的信息','textarea'],['伏笔','要埋下或回应的线索','textarea'],['钩子','章节末尾的悬念或推动','textarea']] },
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
    if (type === 'dialogue') return `# ${schema.title}\n\n${data['角色名'] || '角色'}：${data['心理或动作'] ? `［${data['心理或动作']}］` : ''}“${data['台词内容'] || ''}”\n\n## 对话目的\n${data['对话目的'] || ''}`;
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
