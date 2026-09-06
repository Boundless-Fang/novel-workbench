import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const webRoot = process.cwd();
const workspaceRoot = resolve(webRoot, '..');
const projectsRoot = join(workspaceRoot, '小说项目');
const scoringRoot = join(webRoot, '..', '工作流脚本', '文风评分');
const scanScript = join(scoringRoot, 'scripts', 'bench', 'scan-corpus.ts');
const projectScoreScript = join(webRoot, '..', '工作流脚本', '项目评分器.ts');
const workflowScript = join(webRoot, '..', '工作流脚本', '工作流引擎.py');
const chapterBriefScript = join(webRoot, '..', '工作流脚本', '章节输入判别.py');
const projectBriefScript = join(webRoot, '..', '工作流脚本', '小说简介判别.py');
const workflowPython = [
  process.env.NOVEL_PYTHON,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe') : '',
  process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe') : '',
  'C:\\Users\\方文杰\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python311', 'python.exe') : '',
  process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe') : '',
  'C:\\Users\\方文杰\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
].find(candidate => candidate && existsSync(candidate));
const settingsFile = join(webRoot, '..', '工作流脚本', '工作台设置.json');
const defaultPromptsRoot = join(webRoot, '..', '工作流脚本', '默认提示词');
const slopRulesFile = join(scoringRoot, 'src', 'services', 'checker', 'slop-rules.ts');
const defaultAssetIds = new Set(['language_style', 'person_vocab', 'dialogue_vocab', 'common_vocab', 'forbidden_vocab']);
const defaultAssetFiles = { language_style:['语言风格.txt', '知识库/语言风格.md'], person_vocab:['人物词库.md', '词汇库/人物词库.md'], dialogue_vocab:['对话词库.md', '词汇库/对话词库.md'], common_vocab:['通用词库.md', '词汇库/通用词库.md'] };
const workflowTasks = new Set(['compile_intro', 'compile_character_roster', 'generate_characters_batch', 'compile_relation_roster', 'generate_relations_batch', 'compile_anchor', 'compile_config', 'compile_dialogue', 'compile_relation', 'compile_style', 'compile_plot', 'compile_volume', 'compile_ledger', 'generate_worldview', 'generate_worldview_json', 'generate_character', 'compile_snapshot', 'generate_prose', 'rewrite_prose', 'validate', 'text_stats', 'word_frequency', 'style', 'positive_vocabulary', 'exclusive_vocabulary']);
const workflowRuns = new Map();
const runFile = promisify(execFile);
const types = { '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const textExtensions = new Set(['.md', '.txt', '.json', '.jsonl', '.yaml', '.yml']);
const writableTextExtensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);

function send(response, status, body) { response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); response.end(JSON.stringify(body)); }
function readBody(request) { return new Promise((resolveBody, reject) => { let raw = ''; request.setEncoding('utf8'); request.on('data', chunk => { raw += chunk; if (raw.length > 30_000_000) reject(new Error('请求内容过大')); }); request.on('end', () => { try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('请求格式错误')); } }); request.on('error', reject); }); }
function safeSegment(value, label) { if (typeof value !== 'string' || !value.trim() || value.includes('..') || /[\\/:*?"<>|]/.test(value)) throw new Error(`${label}不合法`); return value.trim(); }
function safePath(value) { if (typeof value !== 'string' || !value || value.startsWith('/') || value.startsWith('\\') || value.includes('..')) throw new Error('文件路径不合法'); const parts = value.replaceAll('\\', '/').split('/'); if (parts.some(part => !part || /[:*?"<>|]/.test(part))) throw new Error('文件路径不合法'); return parts.join('/'); }
function projectPath(project, file = '') { const base = resolve(projectsRoot, safeSegment(project, '项目名')); const target = resolve(base, file ? safePath(file) : '.'); if (relative(base, target).startsWith('..')) throw new Error('文件路径不在项目目录内'); return target; }
function chapterFiles(project, prosePath) { const path=safePath(prosePath); if(!path.startsWith('正文/') || extname(path).toLowerCase()!=='.txt') throw new Error('章节正文路径不合法'); const parts=path.split('/'), filename=parts.at(-1), chapter=filename.slice(0,-4), volume=parts.length===3 ? parts[1] : ''; const proseFile=projectPath(project,path), promptDirs=[projectPath(project,`提示词/${chapter}`), ...(volume ? [projectPath(project,`提示词/${volume}/${chapter}`)] : [])]; return {path, proseFile, chapter, volume, promptDirs}; }
function forbiddenLexicon() { const source = readFileSync(slopRulesFile, 'utf8'), labels={psych:'抽象心理',action:'俗套动作',formula:'公式句式',modifier:'空洞修饰',metaphor:'禁用比喻',emotion:'负面情绪'}, groups=new Map(), matcher=/\.\.\.(w|r)\("([^"]+)",\s*(\d),\s*\[([\s\S]*?)\]\)/g; for(const match of source.matchAll(matcher)){const key=`${match[2]} / L${match[3]}`, tokens=[...match[4].matchAll(/"((?:\\.|[^"\\])*)"/g)].map(item=>{try{return JSON.parse(`"${item[1]}"`);}catch{return item[1];}}); if(tokens.length){const group=groups.get(key)||{label:labels[match[2]]||match[2],tokens:[]}; group.tokens.push(...tokens); groups.set(key,group);}} return '# 禁用词库\n\n> 从文风评分规则表自动提取；L1、L2、L3 为检测严重度。正则条目以 `/.../` 表示。\n\n'+[...groups.entries()].map(([key,group])=>`## ${key}（${group.label}）\n\n${group.tokens.map(token=>`- \`${token}\``).join('\n')}`).join('\n\n')+'\n'; }
function defaultAssetSource(id) { if(!defaultAssetIds.has(id)) throw new Error('默认资料不存在'); return id==='forbidden_vocab' ? join(defaultPromptsRoot, '禁用词库.md') : join(defaultPromptsRoot, defaultAssetFiles[id][0]); }
function defaultAssetContent(id) { const source=defaultAssetSource(id); return existsSync(source) ? readFileSync(source, 'utf8') : id==='forbidden_vocab' ? forbiddenLexicon() : ''; }
function copyDefaultAssets(base, choices) { for(const id of [...new Set(Array.isArray(choices)?choices:[])].filter(id=>defaultAssetIds.has(id))){ const target=id==='forbidden_vocab' ? '词汇库/禁用词库.md' : defaultAssetFiles[id][1], destination=join(base,target), content=defaultAssetContent(id); if(content){mkdirSync(resolve(destination,'..'),{recursive:true});writeFileSync(destination,content,'utf8');} } }
function ensureProject(project, defaultAssets=[]) { const base = projectPath(project); ['提取', '知识库/角色卡', '知识库/关系卡', '词汇库', '剧情/剧情卷', '提示词', '正文', '草稿', '评分', '原著'].forEach(folder => mkdirSync(join(base, folder), { recursive:true })); copyDefaultAssets(base, defaultAssets); return base; }
function projectNames() { mkdirSync(projectsRoot, { recursive:true }); return readdirSync(projectsRoot, { withFileTypes:true }).filter(item => item.isDirectory() && /^(原创|同人)-/.test(item.name)).map(item => item.name).sort((a,b) => a.localeCompare(b, 'zh-CN')); }
function tree(base, prefix = '') { return readdirSync(base, { withFileTypes:true }).filter(item => !item.name.startsWith('.')).map(item => { const path = prefix ? `${prefix}/${item.name}` : item.name; return item.isDirectory() ? { type:'directory', name:item.name, path, children:tree(join(base, item.name), path) } : { type:'file', name:item.name, path, size:statSync(join(base, item.name)).size }; }).sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name, 'zh-CN') : a.type === 'directory' ? -1 : 1); }
function decodeUpload(value) { const match = typeof value === 'string' && /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(value); if (!match) throw new Error('上传内容格式不合法'); const data = Buffer.from(match[2], 'base64'); if (data.length > 20_000_000) throw new Error('上传文件不能超过 20MB'); return data; }
function readSettings() { try { return JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { return {}; } }
function cleanSettings(value) { const raw = value && typeof value === 'object' ? value : {}; const providers = Array.isArray(raw.providers) ? raw.providers.slice(0, 20).map(item => ({ name:safeSegment(String(item?.name || ''), '提供方名称'), apiUrl:String(item?.apiUrl || '').trim().slice(0, 500), model:String(item?.model || '').trim().slice(0, 160), apiKey:String(item?.apiKey || '').trim().slice(0, 600) })).filter(item => item.name) : []; const enabledSteps = Array.isArray(raw.enabledSteps) ? raw.enabledSteps.filter(item => typeof item === 'string' && /^[a-z_]+$/.test(item)).slice(0, 30) : []; const defaultAssets = Array.isArray(raw.defaultAssets) ? raw.defaultAssets.filter(item => typeof item === 'string' && defaultAssetIds.has(item)) : [...defaultAssetIds]; const scriptModels = raw.scriptModels && typeof raw.scriptModels === 'object' ? Object.fromEntries(Object.entries(raw.scriptModels).filter(([key, item]) => /^[a-z_]+$/.test(key) && item && typeof item === 'object').slice(0, 30).map(([key, item]) => [key, {provider:String(item.provider || '').slice(0, 80), model:String(item.model || '').slice(0, 160), thinking:['无','disabled','low','medium','high'].includes(item.thinking) ? item.thinking : 'medium'}])) : {}; const scriptPrompts = raw.scriptPrompts && typeof raw.scriptPrompts === 'object' ? Object.fromEntries(Object.entries(raw.scriptPrompts).filter(([key, text]) => /^[a-z_]+$/.test(key) && typeof text === 'string').slice(0, 30).map(([key, text]) => [key, text.slice(0, 30000)])) : {}; return { defaultMode:['手动','标准','自动'].includes(raw.defaultMode) ? raw.defaultMode : '标准', theme:raw.theme === 'dark' ? 'dark' : 'light', enterToSend:raw.enterToSend !== false, provider:String(raw.provider || 'deepseek').slice(0, 80), model:String(raw.model || '').slice(0, 160), apiUrl:String(raw.apiUrl || '').slice(0, 500), providers, scriptModels, scriptPrompts, enabledSteps, defaultAssets, sidebarOpen:raw.sidebarOpen !== false, sidebarWidth:Math.max(20, Math.min(60, Number(raw.sidebarWidth) || 36)), openFilesInSidebar:raw.openFilesInSidebar !== false }; }
function apiKeyEnvName(providerName) { return `NOVEL_${providerName.replace(/[^\p{L}\p{N}_]+/gu, '_').toUpperCase()}_API_KEY`; }
function workflowEnvironment(settings) { const env={...process.env, PYTHONUTF8:'1', PYTHONIOENCODING:'utf-8', NOVEL_PROJECTS_ROOT:projectsRoot}; for (const provider of settings.providers) if (provider.apiKey) env[apiKeyEnvName(provider.name)]=provider.apiKey; return env; }
function assertWorkflowModel(task) { const settings=cleanSettings(readSettings()), override=settings.scriptModels[task] || {}, providerName=override.provider || settings.provider, provider=settings.providers.find(item=>item.name===providerName), model=override.model || settings.model || provider?.model; if (!provider?.apiKey || !provider?.apiUrl || !model) throw new Error('尚未配置可用 API：请在模型设置中填写 API Key。'); }
function siliconFlowModels(models) { const preferred=['deepseek-ai/DeepSeek-V3.2','Pro/deepseek-ai/DeepSeek-V3.2','Qwen/Qwen3.5-397B-A17B','Qwen/Qwen3.5-122B-A10B','Kimi-K2.6','zai-org/GLM-5.1']; const available=new Set(models); return preferred.filter(model=>available.has(model)); }

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  try {
    if (url.pathname === '/api/projects' && request.method === 'GET') return send(response, 200, { projects:projectNames() });
    if (url.pathname === '/api/default-assets' && request.method === 'GET') { const asset=String(url.searchParams.get('asset') || ''); return send(response, 200, { asset, content:defaultAssetContent(asset) }); }
    if (url.pathname === '/api/default-assets' && request.method === 'PUT') { const body=await readBody(request), asset=String(body.asset || ''), source=defaultAssetSource(asset), content=String(body.content ?? ''); if(Buffer.byteLength(content,'utf8')>2_000_000) throw new Error('默认资料不能超过 2MB'); mkdirSync(resolve(source,'..'),{recursive:true}); writeFileSync(source,content,'utf8'); return send(response,200,{asset,content}); }
    if (url.pathname === '/api/settings' && request.method === 'GET') return send(response, 200, { settings:cleanSettings(readSettings()) });
    if (url.pathname === '/api/settings' && request.method === 'PUT') { const settings=cleanSettings(await readBody(request)); writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8'); return send(response, 200, { settings }); }
    if (url.pathname === '/api/providers/models' && ['GET','POST'].includes(request.method)) { const settings=cleanSettings(readSettings()), requestConfig=request.method==='POST'?await readBody(request):{}, providerName=String(requestConfig.provider||url.searchParams.get('provider')||settings.provider), saved=settings.providers.find(item=>item.name===providerName), apiKey=String(requestConfig.apiKey||saved?.apiKey||''), provider={apiUrl:String(requestConfig.apiUrl||saved?.apiUrl||''),apiKey}; if(!provider.apiUrl || !provider.apiKey) throw new Error('请先填写该提供方的 API 地址和 API Key，随后即可获取最新模型。'); const headers=providerName==='Anthropic（Claude）'?{'x-api-key':provider.apiKey,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${provider.apiKey}`}, endpoint=`${provider.apiUrl.replace(/\/$/,'')}/models`; let upstream; try { upstream=await fetch(endpoint,{headers,signal:AbortSignal.timeout(15_000)}); } catch { throw new Error('无法连接模型列表接口，请检查 API 地址、网络或代理设置。'); } if(!upstream.ok) throw new Error(`模型列表请求失败：HTTP ${upstream.status}`); const payload=await upstream.json(), models=(Array.isArray(payload?.data)?payload.data:[]).map(item=>typeof item==='string'?item:item?.id).filter(item=>typeof item==='string'&&item); return send(response,200,{provider:providerName,models:providerName==='硅基流动'?siliconFlowModels(models):models.sort((a,b)=>a.localeCompare(b))}); }
    if (url.pathname === '/api/projects' && request.method === 'POST') { const body = await readBody(request); const type = body.type === '同人' ? '同人' : '原创'; const project = `${type}-${safeSegment(String(body.name || ''), '小说名称')}`; if (existsSync(projectPath(project))) return send(response, 409, { error:'同名小说项目已存在' }); ensureProject(project, body.defaultAssets); return send(response, 201, { project }); }
    const projectMatch = /^\/api\/projects\/([^/]+)(?:\/(tree))?$/.exec(url.pathname);
    if (projectMatch && request.method === 'GET' && projectMatch[2] === 'tree') { const project = decodeURIComponent(projectMatch[1]); return send(response, 200, { project, tree:tree(projectPath(project)) }); }
    if (projectMatch && request.method === 'PATCH') { const oldName = decodeURIComponent(projectMatch[1]); const body = await readBody(request); const type = body.type === '同人' ? '同人' : '原创'; const renamed = `${type}-${safeSegment(String(body.name || ''), '小说名称')}`; const oldPath = projectPath(oldName), newPath = projectPath(renamed); if (!existsSync(oldPath)) throw new Error('项目不存在'); if (existsSync(newPath)) return send(response, 409, { error:'同名小说项目已存在' }); renameSync(oldPath, newPath); return send(response, 200, { project:renamed }); }
    if (projectMatch && request.method === 'DELETE') { const project=decodeURIComponent(projectMatch[1]), target=projectPath(project); if (!existsSync(target)) throw new Error('项目不存在'); rmSync(target,{recursive:true,force:false}); return send(response,200,{deleted:project}); }
    if (url.pathname === '/api/file' && request.method === 'GET') { const project = url.searchParams.get('project'), path = url.searchParams.get('path'), file = projectPath(project, path); if (!existsSync(file) || !statSync(file).isFile()) return send(response, 404, { error:'文件不存在' }); if (!textExtensions.has(extname(file).toLowerCase())) return send(response, 415, { error:'该文件不能作为文本编辑' }); return send(response, 200, { path:safePath(path), content:readFileSync(file, 'utf8') }); }
    if (url.pathname === '/api/file' && request.method === 'PUT') { const body = await readBody(request); const path = safePath(body.path), file = projectPath(body.project, path); if (!writableTextExtensions.has(extname(file).toLowerCase())) throw new Error('仅支持保存 md、txt、json、yaml 文件'); const content = String(body.content ?? ''); if (Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('文本文件不能超过 2MB'); mkdirSync(resolve(file, '..'), { recursive:true }); writeFileSync(file, content, 'utf8'); return send(response, 200, { path }); }
    if (url.pathname === '/api/file' && request.method === 'PATCH') { const body = await readBody(request); const from = projectPath(body.project, body.from), toPath = safePath(body.to), to = projectPath(body.project, toPath); if (!existsSync(from) || !statSync(from).isFile()) throw new Error('源文件不存在'); if (existsSync(to)) return send(response, 409, { error:'目标文件已存在' }); mkdirSync(resolve(to, '..'), { recursive:true }); renameSync(from, to); return send(response, 200, { path:toPath }); }
    if (url.pathname === '/api/file' && request.method === 'DELETE') { const project = url.searchParams.get('project'), path = url.searchParams.get('path'), file = projectPath(project, path); if (!existsSync(file) || !statSync(file).isFile()) return send(response, 404, { error:'文件不存在' }); rmSync(file); return send(response, 200, { deleted:safePath(path) }); }
    if (url.pathname === '/api/chapter' && request.method === 'DELETE') { const project=url.searchParams.get('project'), prosePath=url.searchParams.get('prosePath'), chapter=chapterFiles(project, prosePath); if(!existsSync(chapter.proseFile) || !statSync(chapter.proseFile).isFile()) return send(response,404,{error:'章节正文不存在'}); rmSync(chapter.proseFile); const removed=[]; for(const dir of chapter.promptDirs) if(existsSync(dir) && statSync(dir).isDirectory()){rmSync(dir,{recursive:true,force:true});removed.push(relative(projectPath(project),dir).replaceAll('\\','/'));} return send(response,200,{deleted:chapter.path,promptDirs:removed}); }
    if (url.pathname === '/api/chapter' && request.method === 'PATCH') { const body=await readBody(request), chapter=chapterFiles(body.project, body.prosePath), next=safeSegment(String(body.name||'').replace(/\.txt$/i,''),'章节名称'), nextPath=`${chapter.path.slice(0,chapter.path.lastIndexOf('/')+1)}${next}.txt`, nextFile=projectPath(body.project,nextPath); if(!existsSync(chapter.proseFile) || !statSync(chapter.proseFile).isFile()) return send(response,404,{error:'章节正文不存在'}); if(existsSync(nextFile)) return send(response,409,{error:'同名章节已存在'}); renameSync(chapter.proseFile,nextFile); const moved=[]; for(const dir of chapter.promptDirs){if(!existsSync(dir)||!statSync(dir).isDirectory())continue;const target=resolve(dir,'..',next);if(existsSync(target)) throw new Error('同名章节提示词目录已存在');renameSync(dir,target);moved.push(relative(projectPath(body.project),target).replaceAll('\\','/'));} return send(response,200,{path:nextPath,promptDirs:moved}); }
    if (url.pathname === '/api/upload' && request.method === 'POST') { const body = await readBody(request); const name = safeSegment(String(body.name || ''), '文件名'), destination = projectPath(body.project, `原著/${name}`); writeFileSync(destination, decodeUpload(body.data)); return send(response, 201, { path:`原著/${name}` }); }
    if (url.pathname === '/api/migrate/first-volume' && request.method === 'POST') { const body = await readBody(request), base = projectPath(body.project), volume = safeSegment(String(body.volume || '第 1 卷'), '卷名'), prose = join(base, '正文'), prompts = join(base, '提示词'), proseVolume = join(prose, volume), promptVolume = join(prompts, volume); mkdirSync(proseVolume, { recursive:true }); mkdirSync(promptVolume, { recursive:true }); const moved=[]; for(const entry of readdirSync(prose,{withFileTypes:true}).filter(entry=>entry.isFile()&&extname(entry.name).toLowerCase()==='.txt')){ renameSync(join(prose,entry.name),join(proseVolume,entry.name)); moved.push(`正文/${volume}/${entry.name}`); } for(const entry of readdirSync(prompts,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&entry.name!==volume)){ renameSync(join(prompts,entry.name),join(promptVolume,entry.name)); moved.push(`提示词/${volume}/${entry.name}`); } return send(response,200,{volume,moved}); }
    if (url.pathname === '/api/score' && request.method === 'POST') { const body = await readBody(request), requested = safePath(body.file), prosePath = requested.includes('/') ? requested : `正文/${safeSegment(requested, '正文文件')}`, proseFile = projectPath(body.project, prosePath), lexiconFile = projectPath(body.project, '词汇库/禁用词库.md'); if (!prosePath.startsWith('正文/')) throw new Error('评分文件必须位于正文目录'); if (!existsSync(projectScoreScript)) throw new Error('未找到项目评分器'); if (!existsSync(proseFile)) throw new Error('当前章节正文不存在'); const { stdout, stderr } = await runFile(process.execPath, ['--import', 'tsx', projectScoreScript, proseFile, lexiconFile], { cwd:scoringRoot, timeout:60_000, windowsHide:true }); return send(response, 200, { report:stdout || stderr || '评分脚本没有返回结果' }); }
    if (url.pathname === '/api/workflow/cancel' && request.method === 'POST') { const runId=String((await readBody(request)).runId || ''); const controller=workflowRuns.get(runId); if(!controller) return send(response,404,{error:'没有正在运行的任务'}); controller.abort(); return send(response,202,{cancelled:true}); }
    if (url.pathname === '/api/workflow/run' && request.method === 'POST') {
      const body = await readBody(request);
      const task = String(body.task || '');
      const project = safeSegment(body.project, '项目名');
      if (!workflowTasks.has(task)) throw new Error('不支持的流程任务');
      if (!existsSync(workflowScript)) throw new Error('未找到标准模式流程脚本');
      assertWorkflowModel(task);
      const inputMode = body.inputMode === 'natural' ? 'natural' : 'structured';
      const inputComplete = body.inputComplete === true;
      const naturalInput = typeof body.naturalInput === 'string' ? body.naturalInput.trim() : '';
      const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : null;
      if (inputMode === 'structured' && !input) throw new Error('结构化输入必须是 JSON 对象');
      if (inputMode === 'natural' && !naturalInput) throw new Error('自然语言输入不能为空');
      const args = [...(workflowPython ? [] : ['-3']), workflowScript, '--task', task, '--project', project, '--input_mode', inputMode];
      if (inputMode === 'natural') args.push('--natural_input', naturalInput); else { args.push('--input', JSON.stringify(input)); if (inputComplete) args.push('--input_complete'); }
      const runId=/^[a-zA-Z0-9-]{8,80}$/.test(String(body.runId||'')) ? String(body.runId) : null;
      if(runId && workflowRuns.has(runId)) throw new Error('该任务正在运行');
      const controller=new AbortController(); if(runId)workflowRuns.set(runId,controller);
      let stdout, stderr;
      try { ({ stdout, stderr } = await runFile(workflowPython || 'py', args, { cwd:workspaceRoot, timeout:600_000, windowsHide:true, maxBuffer:10_000_000, env:workflowEnvironment(cleanSettings(readSettings())), signal:controller.signal })); }
      catch (error) {
        if(controller.signal.aborted) throw new Error('任务已终止');
        const rawDetail=String(error?.stderr || error?.stdout || error?.message || '脚本没有返回错误信息').trim();
        const detailLines=rawDetail.split(/\r?\n/).filter(Boolean);
        let detail=rawDetail.slice(0, 12_000), usage=null;
        try {
          const parsed=JSON.parse(detailLines.at(-1) || '');
          if (parsed && parsed.ok === false) {
            detail=String(parsed.error || detail).slice(0, 12_000);
            usage=parsed.usage || null;
          }
        } catch (_) {}
        const workflowError=new Error(detail);
        if (usage) workflowError.usage=usage;
        throw workflowError;
      }
      finally { if(runId)workflowRuns.delete(runId); }
      let result;
      try { result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)); } catch { result = { ok:true, outputs:[], log:stdout || stderr }; }
      return send(response, 200, { task, ...result, log:stdout || stderr });
    }
    if (url.pathname === '/api/chapter-brief/assess' && request.method === 'POST') {
      const body=await readBody(request), project=safeSegment(body.project, '项目名'), chapter=String(body.chapter || '').trim(), content=String(body.content || '').trim();
      if (!chapter || !content) throw new Error('请输入本章信息');
      if (!existsSync(chapterBriefScript)) throw new Error('未找到章节信息判别脚本');
      assertWorkflowModel('compile_anchor');
      let stdout, stderr;
      try { ({stdout,stderr}=await runFile(workflowPython || 'py', [...(workflowPython ? [] : ['-3']), chapterBriefScript, '--project', project, '--chapter', chapter, '--content', content], {cwd:workspaceRoot, timeout:180_000, windowsHide:true, maxBuffer:2_000_000, env:workflowEnvironment(cleanSettings(readSettings()))})); }
      catch (error) { const detail=String(error?.stderr || error?.stdout || error?.message || '判别脚本没有返回错误信息').trim().slice(0, 12_000); throw new Error(`章节信息判别失败：${detail}`); }
      try { return send(response,200,JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); }
      catch { throw new Error('章节信息判别返回格式错误'); }
    }
    if (url.pathname === '/api/project-brief/assess' && request.method === 'POST') {
      const body=await readBody(request), project=safeSegment(body.project, '项目名'), content=String(body.content || '').trim();
      if (!content) throw new Error('请输入小说相关信息');
      if (!existsSync(projectBriefScript)) throw new Error('未找到小说简介判别脚本');
      assertWorkflowModel('compile_intro');
      let stdout, stderr;
      try { ({stdout,stderr}=await runFile(workflowPython || 'py', [...(workflowPython ? [] : ['-3']), projectBriefScript, '--project', project, '--content', content], {cwd:workspaceRoot, timeout:180_000, windowsHide:true, maxBuffer:2_000_000, env:workflowEnvironment(cleanSettings(readSettings()))})); }
      catch (error) { const detail=String(error?.stderr || error?.stdout || error?.message || '简介判别脚本没有返回错误信息').trim().slice(0, 12_000); throw new Error(`小说简介判别失败：${detail}`); }
      try { return send(response,200,JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); }
      catch { throw new Error('小说简介判别返回格式错误'); }
    }
  } catch (error) { const body={ error:error.message || '请求失败' }; if (error.usage) body.usage=error.usage; return send(response, 400, body); }
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname, filePath = normalize(join(webRoot, requestPath));
  if (!filePath.startsWith(webRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type':types[extname(filePath)] || 'application/octet-stream', 'Cache-Control':'no-store, max-age=0' }); createReadStream(filePath).pipe(response);
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
