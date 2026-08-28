import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';

const webRoot = process.cwd();
// 项目根随工作区移动：web/ 的上两级就是当前工作区，而不是写死盘符。
const workspaceRoot = resolve(webRoot, '..', '..');
const projectsRoot = join(workspaceRoot, '小说项目');
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error('请求内容过大')); });
    request.on('end', () => { try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('请求格式错误')); } });
    request.on('error', reject);
  });
}
function safeSegment(value, label) {
  if (typeof value !== 'string' || !value || value.includes('..') || /[\\/:*?"<>|]/.test(value)) throw new Error(`${label}不合法`);
  return value;
}
function projectPath(project, file = '') {
  const projectName = safeSegment(project, '项目名');
  const base = resolve(projectsRoot, projectName);
  const target = resolve(base, file);
  if (relative(base, target).startsWith('..')) throw new Error('文件路径不在项目目录内');
  return target;
}
function ensureProject(projectName) {
  const base = projectPath(projectName);
  [base, join(base, '提取'), join(base, '知识库', '角色卡'), join(base, '知识库', '关系卡'), join(base, '剧情', '剧情卷'), join(base, '提示词'), join(base, '正文'), join(base, '原著')].forEach(folder => mkdirSync(folder, { recursive:true }));
  return base;
}

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/api/projects' && request.method === 'GET') {
      mkdirSync(projectsRoot, { recursive:true });
      const projects = readdirSync(projectsRoot, { withFileTypes:true })
        .filter(item => item.isDirectory() && /^(原创|同人)-/.test(item.name))
        .map(item => item.name);
      return send(response, 200, { root:'小说项目', projects });
    }
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const body = await readBody(request);
      const type = body.type === '同人' ? '同人' : '原创';
      const name = safeSegment(String(body.name || '').trim(), '小说名称');
      const project = `${type}-${name}`;
      const base = projectPath(project);
      if (existsSync(base)) return send(response, 409, { error:'同名小说项目已存在' });
      ensureProject(project);
      return send(response, 201, { project });
    }
    if (url.pathname === '/api/file' && request.method === 'PUT') {
      const body = await readBody(request);
      const destination = projectPath(body.project, body.path);
      mkdirSync(join(destination, '..'), { recursive:true });
      writeFileSync(destination, String(body.content ?? ''), 'utf8');
      return send(response, 200, { path:body.path });
    }
  } catch (error) {
    return send(response, 400, { error:error.message || '请求失败' });
  }
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(webRoot, requestPath));
  if (!filePath.startsWith(webRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
