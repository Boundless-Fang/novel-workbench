const { ref } = Vue;
import { confirmAction, notifyInfo } from './notify.js';

const alert = notifyInfo;

export function useProject() {
    const activeTab = ref('editor');
    const projects = ref([]);
    const currentProject = ref('');
    const chapters = ref([]);
    const currentChapter = ref('');
    const editorContent = ref('');
    const saveStatus = ref('已保存');
    let saveTimeout = null;

    const projectActionMode = ref('create'); 
    const newProjectName = ref('');
    const existingProjectSelect = ref('');
    const newProjectBranch = ref('原创');
    const newProjectReferenceStyle = ref('');
    const availableStyles = ref([]);

    const showChapterModal = ref(false); 
    const newChapterNum = ref(1); 
    const newChapterTitle = ref(''); 
    const showProjectModal = ref(false); 
    const openProjectModal = () => { 
        projectActionMode.value = 'create'; 
        newProjectName.value = ''; 
        existingProjectSelect.value = ''; 
        showProjectModal.value = true; 
    }; 
    
    // 角色名单
    const projectCharacters = ref([]);

    const getChapterNumber = (name) => { 
        let arabicMatch = name.match(/\d+/); 
        if (arabicMatch) return parseInt(arabicMatch[0]); 

        let cnMatch = name.match(/第([零一二两三四五六七八九十百千万]+)[章回节卷]/); 
        if (cnMatch) { 
            const cnNum = cnMatch[1]; 
            const cnMap = { '零':0, '一':1, '二':2, '两':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9 }; 
            const cnUnits = { '十':10, '百':100, '千':1000, '万':10000 }; 
             
            let result = 0; 
            let tmp = 0; 
            for (let i = 0; i < cnNum.length; i++) { 
                let char = cnNum[i]; 
                if (cnUnits[char]) { 
                    let unit = cnUnits[char]; 
                    if (tmp === 0 && unit === 10) tmp = 1; 
                    result += tmp * unit; 
                    tmp = 0; 
                } else { 
                    tmp = cnMap[char] || 0; 
                } 
            } 
            result += tmp; 
            return result; 
        } 
        return 999999; 
    }; 

    const toChineseNumber = (num) => {
        const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (!Number.isFinite(num) || num <= 0) return String(num);
        if (num < 10) return digits[num];
        if (num < 20) return num === 10 ? '十' : `十${digits[num % 10]}`;
        if (num < 100) {
            const tens = Math.floor(num / 10);
            const ones = num % 10;
            return `${digits[tens]}十${ones ? digits[ones] : ''}`;
        }
        return String(num);
    };

    const formatChapterLabel = (name) => {
        const cleanName = name.replace('.txt', '');
        const legacyMatch = cleanName.match(/^chapter_(\d+)(?:_(.+))?$/i);
        if (legacyMatch) {
            const chapterNum = parseInt(legacyMatch[1], 10);
            const suffix = legacyMatch[2] ? `_${legacyMatch[2]}` : '';
            return `第${toChineseNumber(chapterNum)}章${suffix}`;
        }
        const arabicChapterMatch = cleanName.match(/^第(\d+)章(?:_(.+))?$/);
        if (arabicChapterMatch) {
            const chapterNum = parseInt(arabicChapterMatch[1], 10);
            const suffix = arabicChapterMatch[2] ? `_${arabicChapterMatch[2]}` : '';
            return `第${toChineseNumber(chapterNum)}章${suffix}`;
        }
        return cleanName;
    };

    const parseChapterNumber = (name) => {
        const cleanName = String(name || '').replace('.txt', '');
        const legacyMatch = cleanName.match(/^chapter_(\d+)(?:_.+)?$/i);
        if (legacyMatch) return parseInt(legacyMatch[1], 10);

        const normalizedLabel = formatChapterLabel(cleanName);
        const arabicMatch = normalizedLabel.match(/^第(\d+)章(?:_.+)?$/);
        if (arabicMatch) return parseInt(arabicMatch[1], 10);

        return getChapterNumber(normalizedLabel);
    };

    const fetchProjectCharacters = async () => { 
        if(!currentProject.value) return; 
        try { 
            const res = await fetch(`/api/projects/${currentProject.value}/characters`); 
            projectCharacters.value = await res.json(); 
        } catch(e) { console.error(e); } 
    };

    const loadProjects = async () => {
        const res = await fetch('/api/projects');
        projects.value = await res.json();
        if(projects.value.length && !currentProject.value) {
            currentProject.value = projects.value[0];
            fetchChapters();
            fetchProjectCharacters(); // 加载项目时同步拉取角色名单
        }
    };

    const loadStyles = async () => {
        const res = await fetch('/api/styles');
        availableStyles.value = await res.json();
    };

    const fetchChapters = async () => { 
        if(!currentProject.value) return; 
        const res = await fetch(`/api/projects/${currentProject.value}/chapters`); 
        let rawChapters = await res.json(); 
        
        rawChapters.sort((a, b) => parseChapterNumber(a) - parseChapterNumber(b)); 
        chapters.value = rawChapters; 
        
        if(chapters.value.length) { 
            if (!currentChapter.value || !chapters.value.includes(currentChapter.value)) { 
                currentChapter.value = chapters.value[chapters.value.length - 1]; 
            } 
            fetchContent(); 
        } else { currentChapter.value = ''; editorContent.value = ''; } 
    }; 

    const fetchContent = async () => { 
        if(!currentProject.value || !currentChapter.value) return; 
        const cleanName = currentChapter.value.replace('.txt', ''); 
        const res = await fetch(`/api/projects/${currentProject.value}/chapters/${cleanName}/content`); 
        const data = await res.json(); 
        editorContent.value = data.content; 
        saveStatus.value = '已同步'; 
    }; 

    const debouncedSave = () => { 
        saveStatus.value = '修改侦测中...'; 
        clearTimeout(saveTimeout); 
        saveTimeout = setTimeout(async () => { 
            if(!currentProject.value || !currentChapter.value) return; 
            saveStatus.value = '执行落盘...'; 
            const cleanName = currentChapter.value.replace('.txt', ''); 
            await fetch(`/api/projects/${currentProject.value}/chapters/${cleanName}/content`, { 
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ content: editorContent.value }) 
            }); 
            saveStatus.value = '已保存'; 
        }, 1000); 
    }; 

    const openCreateModal = () => { 
        if (!currentProject.value) { 
            alert("请先选择一个目标项目。"); 
            return; 
        } 
        let maxNum = 0; 
        chapters.value.forEach(c => { 
            let num = parseChapterNumber(c); 
            if(num !== 999999 && num > maxNum) maxNum = num; 
        }); 
        newChapterNum.value = maxNum + 1; 
        newChapterTitle.value = ''; 
        showChapterModal.value = true; 
    }; 

    const confirmCreateChapter = async (forceOverwrite = false) => { 
        let finalName = `第${toChineseNumber(newChapterNum.value)}章`; 
        if (newChapterTitle.value.trim()) { 
            finalName += `_${newChapterTitle.value.trim()}`; 
        } 
 
        try { 
            let url = `/api/projects/${currentProject.value}/chapters/${finalName}`; 
            if (forceOverwrite) { 
                url += `?force_overwrite=true`; 
            } 
            
            const res = await fetch(url, { method: 'POST' }); 
            
            // 拦截 409 冲突状态码，触发用户二次确认 
            if (res.status === 409) { 
                const errorData = await res.json(); 
                if (errorData.detail === "FILE_EXISTS") { 
                    if (confirmAction(`章节 [${finalName}] 已存在，是否强制覆盖原文件？\n警告：此操作不可逆！`)) {
                        return await confirmCreateChapter(true); 
                    } else { 
                        return null; 
                    } 
                } 
            } 
 
            if (res.ok) { 
                const data = await res.json();
                const canonicalName = data.chapter_name || finalName;
                await fetchChapters(); 
                currentChapter.value = canonicalName + '.txt'; 
                showChapterModal.value = false; 
                return canonicalName; 
            } else { 
                alert("创建或覆盖失败，目标文件可能被系统锁定。"); 
            } 
        } catch (e) { 
            alert(`请求异常: ${e.message}`); 
        } 
    }; 
 
    const executeRename = async (oldName, newName, forceOverwrite) => { 
        let url = `/api/projects/${currentProject.value}/chapters/${oldName}?new_name=${newName}`; 
        if (forceOverwrite) { 
            url += `&force_overwrite=true`; 
        } 
        try { 
            const res = await fetch(url, { method: 'POST' }); 
            
            if (res.status === 409) { 
                const errorData = await res.json(); 
                if (errorData.detail === "FILE_EXISTS") { 
                    if (confirmAction(`目标章节名 [${newName}] 已被占用，是否强制覆盖该文件？\n警告：被覆盖的章节数据将永久丢失！`)) {
                        await executeRename(oldName, newName, true); 
                    } 
                    return; 
                } 
            } 
            
            if (res.ok) { 
                const data = await res.json();
                const canonicalName = data.chapter_name || newName;
                await fetchChapters(); 
                currentChapter.value = canonicalName + '.txt'; 
            } else { 
                alert("重命名失败，目标文件可能被系统锁定。"); 
            } 
        } catch (e) { 
            alert(`重命名请求异常: ${e.message}`); 
        } 
    }; 
 
    const renameChapter = async () => { 
        const oldName = currentChapter.value.replace('.txt', ''); 
        const name = prompt("覆写原章节名：", oldName); 
        if (name && name.trim() && name !== oldName) { 
            await executeRename(oldName, name.trim(), false); 
        } 
    }; 

    const importToNovel = async (text) => {
        if(!currentProject.value || !currentChapter.value) return;
        try {
            const res = await fetch(`/api/projects/${currentProject.value}/append`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, chapter_name: currentChapter.value })
            });
            if (res.status === 404) {
                const errorData = await res.json();
                if (errorData.detail === "CHAPTER_NOT_FOUND") {
                    alert('当前章节不存在，请先确认目标章节后再导入。');
                    return;
                }
            }
            if (!res.ok) {
                throw new Error('导入失败');
            }
            if(activeTab.value === 'editor') fetchContent();
            alert('导入已执行。');
        } catch(e) { alert('数据流追加引发异常。'); }
    };

    const createProject = async (forceOverwrite = false) => {
        const targetName = projectActionMode.value === 'create' ? newProjectName.value : existingProjectSelect.value;
        let url = '/api/projects';
        if (forceOverwrite) {
            url += '?force_overwrite=true';
        }
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: targetName,
                branch: newProjectBranch.value,
                reference_style: newProjectReferenceStyle.value
            })
        });
        if (res.status === 409) {
            const errorData = await res.json();
            if (errorData.detail === "PROJECT_EXISTS") {
                if (confirmAction('项目名称已存在，是否强制覆盖？\n警告：现有项目内容将被删除并重新初始化。')) {
                    return await createProject(true);
                }
                return;
            }
        }
        if (!res.ok) {
            alert('创建项目失败，请稍后重试。');
            return;
        }
        newProjectName.value = '';
        alert(forceOverwrite ? '项目已强制覆盖并重新初始化。' : '项目已创建，底层工程目录及配置文件已初始化。');
        await loadProjects();
        currentProject.value = projects.value.find(p => p.startsWith(targetName)) || projects.value[projects.value.length - 1];
        activeTab.value = 'editor';
        showProjectModal.value = false;
    };

    return {
        activeTab, projects, currentProject, chapters, currentChapter, editorContent, saveStatus,
        projectActionMode, newProjectName, existingProjectSelect, newProjectBranch, newProjectReferenceStyle, availableStyles,
        showChapterModal, newChapterNum, newChapterTitle, projectCharacters,
        showProjectModal, openProjectModal,
        loadProjects, loadStyles, fetchChapters, fetchContent, debouncedSave, fetchProjectCharacters, 
        formatChapterLabel,
        openCreateModal, confirmCreateChapter, renameChapter, importToNovel, createProject
    };
}
