const { ref, computed } = Vue;
import { notifyInfo } from './notify.js';

const alert = notifyInfo;

export function useChat(config, projectModule, workflowModule) {
    const COMPOSER_FOCUS_EXTRA = 84;
    const CHAT_STORAGE_KEY = 'styleSyncChats';
    const CHAT_CURRENT_ID_KEY = 'styleSyncCurrentChatId';
    const DEFAULT_CHAT_PARAMS = {
        model: 'deepseek-v4-flash',
        systemPrompt: '',
        localForbidden: '',
        temperature: 1.5,
        top_p: 0.9,
        thinking: false,
        reasoning_effort: 'high',
        max_tokens: null,
    };
    const getNewChatTemplate = (id, title) => ({
        id,
        title,
        createdAt: new Date().toISOString(),
        model: DEFAULT_CHAT_PARAMS.model,
        systemPrompt: DEFAULT_CHAT_PARAMS.systemPrompt,
        localForbidden: DEFAULT_CHAT_PARAMS.localForbidden,
        temperature: DEFAULT_CHAT_PARAMS.temperature,
        top_p: DEFAULT_CHAT_PARAMS.top_p,
        thinking: DEFAULT_CHAT_PARAMS.thinking,
        reasoning_effort: DEFAULT_CHAT_PARAMS.reasoning_effort,
        max_tokens: DEFAULT_CHAT_PARAMS.max_tokens,
        stats: { local_hit_count: 0, total_tokens: 0 },
        messages: [],
        isRenaming: false,
        renameDraft: title,
    });

    const normalizeStoredMessage = (message) => {
        if (!message || typeof message !== 'object' || !message.role) return null;
        if (message.role === 'user') {
            const content = String(message.content || '');
            return {
                role: 'user',
                content,
                collapsed: Boolean(message.collapsed),
                isEditing: false,
                editDraft: content
            };
        }
        if (message.role === 'assistant') {
            const versions = Array.isArray(message.versions) && message.versions.length
                ? message.versions.map((item) => ({ content: String(item?.content || '') }))
                : [{ content: '' }];
            const maxIndex = versions.length - 1;
            const activeVersion = Math.min(Math.max(Number(message.active_version) || 0, 0), maxIndex);
            return {
                role: 'assistant',
                versions,
                active_version: activeVersion,
                last_scanned_index: 0,
                matched_indices: new Set()
            };
        }
        return {
            role: String(message.role),
            content: String(message.content || '')
        };
    };

    const normalizeLegacyChatTitle = (title, index) => {
        const safeTitle = String(title || `\u5bf9\u8bdd ${index + 1}`);
        if (
            safeTitle === '\u65b0\u8ba1\u7b97\u8fdb\u7a0b'
            || safeTitle === '\u5bf9\u8bdd'
            || safeTitle.trim() === ''
        ) {
            return '\u5bf9\u8bdd';
        }
        return safeTitle;
    };

    const normalizeStoredChat = (chat, index) => {
        const id = chat?.id || `chat_${Date.now()}_${index}`;
        const title = normalizeLegacyChatTitle(chat?.title, index);
        const messages = Array.isArray(chat?.messages)
            ? chat.messages.map(normalizeStoredMessage).filter(Boolean)
            : [];
        return {
            id,
            title,
            createdAt: chat?.createdAt || new Date().toISOString(),
            model: chat?.model || DEFAULT_CHAT_PARAMS.model,
            systemPrompt: String(chat?.systemPrompt || DEFAULT_CHAT_PARAMS.systemPrompt),
            localForbidden: String(chat?.localForbidden || DEFAULT_CHAT_PARAMS.localForbidden),
            temperature: Number(chat?.temperature ?? DEFAULT_CHAT_PARAMS.temperature),
            top_p: Number(chat?.top_p ?? DEFAULT_CHAT_PARAMS.top_p),
            thinking: Boolean(chat?.thinking ?? DEFAULT_CHAT_PARAMS.thinking),
            reasoning_effort: chat?.reasoning_effort || DEFAULT_CHAT_PARAMS.reasoning_effort,
            max_tokens: chat?.max_tokens ?? DEFAULT_CHAT_PARAMS.max_tokens,
            stats: {
                local_hit_count: Number(chat?.stats?.local_hit_count || 0),
                total_tokens: Number(chat?.stats?.total_tokens || 0),
            },
            messages,
            isRenaming: false,
            renameDraft: title,
        };
    };

    const loadStoredChats = () => {
        if (typeof localStorage === 'undefined') {
            return [getNewChatTemplate('chat_1', '默认对话')];
        }
        try {
            const raw = localStorage.getItem(CHAT_STORAGE_KEY);
            if (!raw) return [getNewChatTemplate('chat_1', '默认对话')];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return [getNewChatTemplate('chat_1', '默认对话')];
            }
            return parsed.map(normalizeStoredChat).filter(Boolean);
        } catch {
            return [getNewChatTemplate('chat_1', '默认对话')];
        }
    };

    const chats = ref(loadStoredChats());
    const currentChatId = ref(
        (typeof localStorage !== 'undefined' && localStorage.getItem(CHAT_CURRENT_ID_KEY))
        || chats.value[0]?.id
        || 'chat_1'
    );
    const chatInput = ref('');
    const isGenerating = ref(false);
    const isComposerFocused = ref(false);
    const workspaceSearchQuery = ref('');
    const activeSearchResultIndex = ref(-1);
    let abortController = null;

    const currentChat = computed(() => chats.value.find(c => c.id === currentChatId.value));
    Vue.watch(
        chats,
        (value) => {
            if (!value.length) {
                const fallback = getNewChatTemplate('chat_1', '默认对话');
                chats.value = [fallback];
                currentChatId.value = fallback.id;
                return;
            }
            if (!value.some((chat) => chat.id === currentChatId.value)) {
                currentChatId.value = value[0].id;
            }
        },
        { deep: true, immediate: true }
    );
    const composerHeight = computed(() => {
        const baseHeight = Number(config.value.composerHeight) || 56;
        return isComposerFocused.value ? baseHeight + COMPOSER_FOCUS_EXTRA : baseHeight;
    });
    const quickPromptButtons = [
        { key: 'modify_character', label: '修改角色卡', icon: 'fa-solid fa-user-pen' },
        { key: 'modify_world', label: '修改世界观', icon: 'fa-solid fa-earth-asia' },
        { key: 'polish_outline', label: '润色章节大纲', icon: 'fa-solid fa-list-check' },
        { key: 'generate_draft', label: '生成正文', icon: 'fa-solid fa-wand-magic-sparkles' },
        { key: 'revise_chapter', label: '修改小说正文', icon: 'fa-solid fa-file-pen' }
    ];
    const lastInjectedLabel = ref('');
    const lastInjectedTemplate = ref('');
    
    const forbiddenRegex = computed(() => {
        const globalWords = config.value.globalForbidden.split(/[,，、\n\s]+/).map(w => w.trim()).filter(Boolean);
        const localWords = (currentChat.value?.localForbidden || '').split(/[,，、\n\s]+/).map(w => w.trim()).filter(Boolean);
        const allWords = [...new Set([...globalWords, ...localWords])];
        if (allWords.length === 0) return null;
        return new RegExp(`(${allWords.join('|')})`, 'gi');
    });

    const createNewChat = () => {
        const newId = 'chat_' + Date.now();
        chats.value.unshift(getNewChatTemplate(newId, '对话'));
        currentChatId.value = newId;
    };

    const copyCurrentChat = () => {
        if(!currentChat.value) return;
        const newId = 'chat_' + Date.now();
        const copy = JSON.parse(JSON.stringify(currentChat.value));
        copy.id = newId;
        copy.title += ' (复刻)';
        copy.createdAt = new Date().toISOString();
        copy.isRenaming = false;
        copy.renameDraft = copy.title;
        chats.value.unshift(copy);
        currentChatId.value = newId;
    };

    const startRenameChat = (chatId) => {
        const targetChat = chats.value.find((chat) => chat.id === chatId);
        if (!targetChat) return;
        targetChat.isRenaming = true;
        targetChat.renameDraft = targetChat.title;
    };

    const cancelRenameChat = (chatId) => {
        const targetChat = chats.value.find((chat) => chat.id === chatId);
        if (!targetChat) return;
        targetChat.renameDraft = targetChat.title;
        targetChat.isRenaming = false;
    };

    const saveRenameChat = (chatId) => {
        const targetChat = chats.value.find((chat) => chat.id === chatId);
        if (!targetChat) return;
        const nextTitle = String(targetChat.renameDraft || '').trim();
        if (!nextTitle) return;
        targetChat.title = nextTitle;
        targetChat.renameDraft = nextTitle;
        targetChat.isRenaming = false;
    };

    const deleteChat = (chatId) => {
        if (chats.value.length <= 1) return;
        chats.value = chats.value.filter((chat) => chat.id !== chatId);
    };

    const formatChatCreatedAt = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    };

    const clearCurrentChatMessages = () => {
        if (currentChat.value) {
            currentChat.value.messages = [];
            currentChat.value.stats.total_tokens = 0;
            currentChat.value.stats.local_hit_count = 0;
        }
        activeSearchResultIndex.value = -1;
    };

    const resetCurrentChatDefaults = () => {
        if (!currentChat.value) return;
        currentChat.value.model = DEFAULT_CHAT_PARAMS.model;
        currentChat.value.systemPrompt = DEFAULT_CHAT_PARAMS.systemPrompt;
        currentChat.value.localForbidden = DEFAULT_CHAT_PARAMS.localForbidden;
        currentChat.value.temperature = DEFAULT_CHAT_PARAMS.temperature;
        currentChat.value.top_p = DEFAULT_CHAT_PARAMS.top_p;
        currentChat.value.thinking = DEFAULT_CHAT_PARAMS.thinking;
        currentChat.value.reasoning_effort = DEFAULT_CHAT_PARAMS.reasoning_effort;
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            const el = document.getElementById('chatContainer');
            if(el) el.scrollTop = el.scrollHeight;
        }, 50);
    };

    const focusComposer = () => {
        setTimeout(() => {
            const input = document.getElementById('workspaceComposer');
            if (input) input.focus();
        }, 50);
    };

    const focusWorkspaceSearch = () => {
        setTimeout(() => {
            const input = document.getElementById('workspaceSearchInput');
            if (input) input.focus();
        }, 50);
    };

    const escapeHtml = (text = '') =>
        String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const escapeRegExp = (text = '') =>
        String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const highlightHtmlText = (html = '', query = '') => {
        if (!query.trim() || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
            return html;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        if (!root) return html;

        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) {
            nodes.push(node);
        }

        const pattern = new RegExp(escapeRegExp(query.trim()), 'gi');
        nodes.forEach((textNode) => {
            const text = textNode.nodeValue || '';
            pattern.lastIndex = 0;
            if (!pattern.test(text)) return;

            const fragment = doc.createDocumentFragment();
            let lastIndex = 0;
            pattern.lastIndex = 0;
            text.replace(pattern, (match, offset) => {
                if (offset > lastIndex) {
                    fragment.appendChild(doc.createTextNode(text.slice(lastIndex, offset)));
                }
                const mark = doc.createElement('mark');
                mark.className = 'bg-yellow-200 text-inherit px-0.5 rounded';
                mark.textContent = match;
                fragment.appendChild(mark);
                lastIndex = offset + match.length;
                return match;
            });
            if (lastIndex < text.length) {
                fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
            }
            textNode.parentNode?.replaceChild(fragment, textNode);
        });

        return root.innerHTML;
    };

    const stopGeneration = () => {
        if (abortController) {
            abortController.abort();
            isGenerating.value = false;
        }
    };

    const handleComposerFocus = () => {
        isComposerFocused.value = true;
    };

    const handleComposerBlur = () => {
        isComposerFocused.value = false;
    };

    const PROMPT_TEMPLATES = {
        modify_character: (content = '') =>
            `请基于以下角色卡进行修改与补全，保持人物核心设定不变，并输出一版更清晰的角色卡。\n\n修改目标：\n1. 补足动机、能力、关系与冲突点\n2. 删除重复描述，统一人设口径\n3. 若发现设定漏洞，请单独列出\n\n角色卡原文：\n${content || '[请在此粘贴角色卡内容]'}`,
        modify_world: (content = '') =>
            `请基于以下世界观设定进行修订，保持整体风格一致，并重点检查规则漏洞与叙事可用性。\n\n输出要求：\n1. 保留已有核心设定\n2. 补全缺失规则、势力关系或时代背景\n3. 如果存在冲突，请给出“问题 - 建议修订”\n\n世界观原文：\n${content || '[请在此粘贴世界观内容]'}`,
        polish_outline: (content = '') =>
            `请润色以下章节大纲，使其更适合后续正文生成。\n\n优化方向：\n1. 强化冲突、推进与节奏\n2. 标出本章钩子或收束点\n3. 尽量避免剧情断裂与信息重复\n\n章节大纲：\n${content || '[请在此粘贴章节大纲]'}`,
        generate_draft: (content = '') =>
            `请基于以下提示词、设定或大纲直接生成小说正文。\n\n要求：\n1. 保持文风统一\n2. 注意角色称呼、世界观规则与上下文一致\n3. 直接输出正文，不要解释过程\n\n生成依据：\n${content || '[请在此粘贴 f5b 导出的提示词 / 大纲 / 设定]'}`,
        revise_chapter: (content = '') =>
            `请在尽量保留剧情事实、人物关系与文风的前提下，修改以下小说正文。\n\n修改目标：\n1. 优化语言流畅度与节奏\n2. 修复不自然表达、重复句式或逻辑跳跃\n3. 不要擅自改动关键剧情结论\n\n待修改正文：\n${content || '[请在此粘贴章节正文]'}`,
    };

    const buildPromptText = (templateKey, content = '') => {
        const builder = PROMPT_TEMPLATES[templateKey];
        return builder ? builder(content) : content;
    };

    const injectIntoWorkspace = (templateKey, content = '', label = '') => {
        const promptText = buildPromptText(templateKey, content);
        chatInput.value = promptText;
        lastInjectedLabel.value = label || quickPromptButtons.find((item) => item.key === templateKey)?.label || '';
        lastInjectedTemplate.value = quickPromptButtons.find((item) => item.key === templateKey)?.label || '自定义模板';
        if (!currentChat.value) createNewChat();
        focusComposer();
        scrollToBottom();
    };

    const clearInjectedWorkspaceContext = () => {
        chatInput.value = '';
        lastInjectedLabel.value = '';
        lastInjectedTemplate.value = '';
    };

    const applyQuickPrompt = (templateKey) => {
        injectIntoWorkspace(templateKey, '', quickPromptButtons.find((item) => item.key === templateKey)?.label || '');
    };

    const inferKnowledgeTemplate = () => {
        const kbType = workflowModule?.kbType?.value || '';
        const selectedFile = workflowModule?.kbSelectedFile?.value || '';

        if (kbType === 'characters') return 'modify_character';
        if (kbType === 'outlines') return 'polish_outline';
        if (kbType === 'prompts') return 'generate_draft';
        if (selectedFile.includes('world_settings')) return 'modify_world';
        if (selectedFile.includes('plot_outlines')) return 'polish_outline';
        return 'generate_draft';
    };

    const injectKnowledgeToWorkspace = () => {
        const selectedFile = workflowModule?.kbSelectedFile?.value || '';
        const content = workflowModule?.kbContent?.value || '';
        if (!selectedFile || !content.trim()) {
            alert('请先在知识库中打开一个可用文件。');
            return;
        }

        const templateKey = inferKnowledgeTemplate();

        injectIntoWorkspace(
            templateKey,
            content.trim(),
            `知识库注入: ${selectedFile}`
        );
    };

    const injectEditorContentToWorkspace = () => {
        const editorContent = projectModule?.editorContent?.value || '';
        if (!editorContent.trim()) {
            alert('当前章节正文为空，暂无可注入内容。');
            return;
        }

        const chapterLabel = projectModule.currentChapter?.value || '当前章节';
        injectIntoWorkspace(
            'revise_chapter',
            editorContent.trim(),
            `正文注入: ${chapterLabel}`
        );
    };

    if (typeof window !== 'undefined' && !window.__styleSyncWorkspaceInjectBound) {
        window.addEventListener('style-sync:inject-workspace', (event) => {
            const detail = event?.detail || {};
            injectIntoWorkspace(
                detail.templateKey || 'generate_draft',
                detail.content || '',
                detail.label || '外部注入'
            );
        });
        window.__styleSyncWorkspaceInjectBound = true;
    }

    const createAssistantMessage = () => ({
        role: 'assistant',
        versions: [{ content: '' }],
        active_version: 0,
        last_scanned_index: 0,
        matched_indices: new Set()
    });

    const createUserMessage = (content) => ({
        role: 'user',
        content,
        collapsed: true,
        isEditing: false,
        editDraft: content
    });

    const shouldCollapseUserMessage = (content = '') =>
        String(content).split(/\r?\n/).length > 3;

    const toggleUserMessageCollapse = (messageIndex) => {
        const targetMessage = currentChat.value?.messages?.[messageIndex];
        if (!targetMessage || targetMessage.role !== 'user' || !shouldCollapseUserMessage(targetMessage.content)) return;
        targetMessage.collapsed = !targetMessage.collapsed;
    };

    const startEditUserMessage = (messageIndex) => {
        const targetMessage = currentChat.value?.messages?.[messageIndex];
        if (!targetMessage || targetMessage.role !== 'user') return;
        targetMessage.editDraft = targetMessage.content;
        targetMessage.isEditing = true;
        targetMessage.collapsed = false;
    };

    const cancelEditUserMessage = (messageIndex) => {
        const targetMessage = currentChat.value?.messages?.[messageIndex];
        if (!targetMessage || targetMessage.role !== 'user') return;
        targetMessage.editDraft = targetMessage.content;
        targetMessage.isEditing = false;
    };

    const saveEditUserMessage = (messageIndex) => {
        const targetMessage = currentChat.value?.messages?.[messageIndex];
        if (!targetMessage || targetMessage.role !== 'user') return;
        const nextContent = (targetMessage.editDraft || '').trim();
        if (!nextContent) return;
        targetMessage.content = nextContent;
        targetMessage.editDraft = nextContent;
        targetMessage.isEditing = false;
        targetMessage.collapsed = shouldCollapseUserMessage(nextContent);
    };

    const streamAssistantReply = async (aiMessage, apiMessages) => {
        isGenerating.value = true;
        abortController = new AbortController();
        aiMessage.last_scanned_index = 0;
        aiMessage.matched_indices = new Set();
        try {
            const payload = {
                api_key: config.value.useDefaultApiConfig ? '' : (config.value.apiKey || '').trim(),
                model: currentChat.value.model,
                messages: apiMessages,
                system_prompt: currentChat.value.systemPrompt,
                temperature: currentChat.value.temperature,
                top_p: currentChat.value.top_p,
                thinking: currentChat.value.thinking,
                reasoning_effort: currentChat.value.reasoning_effort
            };

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: abortController.signal
            });

            if (!response.ok) throw new Error("API 请求反馈异常状态");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                let chunk = decoder.decode(value, { stream: true });
                
                const usageMatch = chunk.match(/__USAGE__:(\d+),(\d+)__/);
                if (usageMatch) {
                    currentChat.value.stats.total_tokens = (currentChat.value.stats.total_tokens || 0) + parseInt(usageMatch[1]) + parseInt(usageMatch[2]);
                    chunk = chunk.replace(/__USAGE__:\d+,\d+__/, '');
                }

                aiMessage.versions[aiMessage.active_version].content += chunk;
                
                const currentContent = aiMessage.versions[aiMessage.active_version].content; 
                if (forbiddenRegex.value && currentContent.length > 0) { 
                    const scanStart = Math.max(0, aiMessage.last_scanned_index - 200); 
                    const testBlock = currentContent.slice(scanStart); 
                    
                    const matches = [...testBlock.matchAll(forbiddenRegex.value)]; 
                    for (const match of matches) { 
                        const absoluteIndex = scanStart + match.index; 
                        aiMessage.matched_indices.add(absoluteIndex); 
                    } 
                    
                    aiMessage.last_scanned_index = currentContent.length; 
                    currentChat.value.stats.local_hit_count = aiMessage.matched_indices.size; 
                    
                    if (aiMessage.matched_indices.size >= config.value.forbiddenTolerance) { 
                        stopGeneration(); 
                        aiMessage.versions[aiMessage.active_version].content += '\n\n<div class="p-3 bg-red-100 text-red-700 rounded border border-red-300 mt-2 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> 内容触发安全拦截机制：敏感词命中次数 (' + aiMessage.matched_indices.size + ') 已达上限。</div>'; 
                        break; 
                    } 
                }
                scrollToBottom();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                aiMessage.versions[aiMessage.active_version].content += `\n\n[系统异常抛出: ${error.message}]`;
            }
        } finally {
            isGenerating.value = false;
            abortController = null;
        }
    };

    const sendMessage = async () => {
        if(!chatInput.value.trim() || isGenerating.value || !currentChat.value) return;

        const userText = chatInput.value.trim();
        currentChat.value.messages.push(createUserMessage(userText));
        chatInput.value = '';
        scrollToBottom();

        const aiMessage = createAssistantMessage();
        currentChat.value.messages.push(aiMessage);

        const apiMessages = currentChat.value.messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.role === 'user' ? m.content : m.versions[m.active_version].content
        }));

        await streamAssistantReply(aiMessage, apiMessages);
    };

    const retryAssistantMessage = async (messageIndex) => {
        if (isGenerating.value || !currentChat.value) return;
        const targetMessage = currentChat.value.messages[messageIndex];
        if (!targetMessage || targetMessage.role !== 'assistant') return;

        targetMessage.versions.push({ content: '' });
        targetMessage.active_version = targetMessage.versions.length - 1;

        const apiMessages = currentChat.value.messages.slice(0, messageIndex).map(m => ({
            role: m.role,
            content: m.role === 'user' ? m.content : m.versions[m.active_version].content
        }));

        scrollToBottom();
        await streamAssistantReply(targetMessage, apiMessages);
    };

    const workspaceSearchResults = computed(() => {
        const query = workspaceSearchQuery.value.trim().toLowerCase();
        const messages = currentChat.value?.messages || [];
        if (!query) return [];

        return messages.flatMap((message, messageIndex) => {
            const content = message.role === 'assistant'
                ? String(message.versions?.[message.active_version]?.content || '')
                : String(message.content || '');
            const lower = content.toLowerCase();
            const indices = [];
            let fromIndex = 0;
            while (true) {
                const hit = lower.indexOf(query, fromIndex);
                if (hit === -1) break;
                indices.push(hit);
                fromIndex = hit + query.length;
            }
            return indices.map((matchIndex) => ({
                messageIndex,
                matchIndex,
                role: message.role,
            }));
        });
    });

    const currentSearchResult = computed(() => {
        const results = workspaceSearchResults.value;
        if (!results.length) return null;
        const safeIndex = Math.min(Math.max(activeSearchResultIndex.value, 0), results.length - 1);
        return results[safeIndex];
    });

    const isSearchMatchMessage = (messageIndex) =>
        workspaceSearchResults.value.some((item) => item.messageIndex === messageIndex);

    const isActiveSearchMessage = (messageIndex) =>
        currentSearchResult.value?.messageIndex === messageIndex;

    const scrollToSearchResult = () => {
        const target = currentSearchResult.value;
        if (!target) return;
        setTimeout(() => {
            const el = document.querySelector(`[data-message-index="${target.messageIndex}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 30);
    };

    const moveSearchResult = (step = 1) => {
        const results = workspaceSearchResults.value;
        if (!results.length) {
            activeSearchResultIndex.value = -1;
            return;
        }
        const current = activeSearchResultIndex.value >= 0 ? activeSearchResultIndex.value : (step >= 0 ? -1 : 0);
        activeSearchResultIndex.value = (current + step + results.length) % results.length;
        scrollToSearchResult();
    };

    const handleWorkspaceSearchInput = () => {
        activeSearchResultIndex.value = workspaceSearchResults.value.length ? 0 : -1;
        scrollToSearchResult();
    };

    const handleWorkspaceSearchKeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        moveSearchResult(event.shiftKey ? -1 : 1);
    };

    const clearWorkspaceSearch = () => {
        workspaceSearchQuery.value = '';
        activeSearchResultIndex.value = -1;
        focusWorkspaceSearch();
    };

    const copyMessageContent = async (messageIndex) => {
        const targetMessage = currentChat.value?.messages?.[messageIndex];
        if (!targetMessage) return;
        const text = targetMessage.role === 'assistant'
            ? String(targetMessage.versions?.[targetMessage.active_version]?.content || '')
            : String(targetMessage.content || '');
        if (!text) return;

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            alert('消息已复制');
        } catch (error) {
            alert(`复制失败: ${error.message}`);
        }
    };

    const renderMarkdown = (text) => {
        if (!text) return '';
        let parsedHtml = marked.parse(text);
        parsedHtml = DOMPurify.sanitize(parsedHtml);
        if (forbiddenRegex.value) {
            parsedHtml = parsedHtml.replace(forbiddenRegex.value, '<span class="forbidden-highlight">$1</span>');
        }
        return highlightHtmlText(parsedHtml, workspaceSearchQuery.value);
    };

    Vue.watch(
        chats,
        (value) => {
            if (typeof localStorage === 'undefined') return;
            const serialized = value.map((chat) => ({
                id: chat.id,
                title: chat.title,
                createdAt: chat.createdAt,
                model: chat.model,
                systemPrompt: chat.systemPrompt,
                localForbidden: chat.localForbidden,
                temperature: chat.temperature,
                top_p: chat.top_p,
                thinking: chat.thinking,
                reasoning_effort: chat.reasoning_effort,
                max_tokens: chat.max_tokens ?? null,
                stats: chat.stats,
                messages: chat.messages.map((message) => {
                    if (message.role === 'assistant') {
                        return {
                            role: 'assistant',
                            versions: message.versions,
                            active_version: message.active_version,
                        };
                    }
                    if (message.role === 'user') {
                        return {
                            role: 'user',
                            content: message.content,
                            collapsed: message.collapsed,
                        };
                    }
                    return message;
                }),
            }));
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(serialized));
        },
        { deep: true }
    );

    Vue.watch(currentChatId, (value) => {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CHAT_CURRENT_ID_KEY, value || '');
        activeSearchResultIndex.value = workspaceSearchResults.value.length ? 0 : -1;
    });

    return {
        chats, currentChatId, currentChat, chatInput, isGenerating, composerHeight,
        workspaceSearchQuery, workspaceSearchResults, activeSearchResultIndex,
        quickPromptButtons, lastInjectedLabel, lastInjectedTemplate,
        createNewChat, copyCurrentChat, clearCurrentChatMessages, 
        sendMessage, retryAssistantMessage, stopGeneration, renderMarkdown,
        copyMessageContent,
        toggleUserMessageCollapse, startEditUserMessage, cancelEditUserMessage, saveEditUserMessage,
        shouldCollapseUserMessage,
        handleWorkspaceSearchInput, handleWorkspaceSearchKeydown, clearWorkspaceSearch,
        moveSearchResult, isSearchMatchMessage, isActiveSearchMessage,
        startRenameChat, cancelRenameChat, saveRenameChat, deleteChat, formatChatCreatedAt,
        applyQuickPrompt, injectKnowledgeToWorkspace, injectEditorContentToWorkspace,
        clearInjectedWorkspaceContext, handleComposerFocus, handleComposerBlur, resetCurrentChatDefaults
    };
}
