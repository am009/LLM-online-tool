class MarkdownTranslator {
    constructor() {
        this.originalBlocks = [];
        this.translationBlocks = [];
        this.currentFile = null;
        this.originalWidth = 45; // percentage
        this.isResizing = false;
        this.sidebarCollapsed = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.setupModal();
        this.setupResizer();
        this.setupSidebar();
    }

    setupEventListeners() {
        // 文件上传
        const uploadBtn = document.getElementById('upload-btn');
        const fileInput = document.getElementById('file-input');
        
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // 导出功能
        document.getElementById('export-btn').addEventListener('click', () => this.exportTranslation());

        // 全部翻译
        document.getElementById('translate-all-btn').addEventListener('click', () => this.translateAll());

        // 设置变更
        document.getElementById('translation-prompt').addEventListener('input', () => this.saveSettings());
        document.getElementById('api-key').addEventListener('input', () => this.saveSettings());
        document.getElementById('api-provider').addEventListener('change', () => this.saveSettings());
        document.getElementById('allow-edit-original').addEventListener('change', () => this.toggleOriginalEdit());
        
        // 侧边栏折叠
        document.getElementById('collapse-btn').addEventListener('click', () => this.toggleSidebar());
    }

    setupModal() {
        const modal = document.getElementById('error-modal');
        const closeBtn = modal.querySelector('.close');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    showError(message) {
        const modal = document.getElementById('error-modal');
        const messageEl = document.getElementById('error-message');
        messageEl.textContent = message;
        modal.style.display = 'block';
    }

    loadSettings() {
        const settings = localStorage.getItem('markdown-translator-settings');
        if (settings) {
            const parsed = JSON.parse(settings);
            document.getElementById('translation-prompt').value = parsed.prompt || '请将以下文本翻译成中文，保持原文的格式和结构，不要添加额外的解释或注释。';
            document.getElementById('api-key').value = parsed.apiKey || '';
            document.getElementById('api-provider').value = parsed.apiProvider || 'openai';
            document.getElementById('allow-edit-original').checked = parsed.allowEditOriginal || false;
            
            // 加载布局设置
            this.originalWidth = parsed.originalWidth || 45;
            this.sidebarCollapsed = parsed.sidebarCollapsed || false;
            this.applyLayoutSettings();
        }
    }

    saveSettings() {
        const settings = {
            prompt: document.getElementById('translation-prompt').value,
            apiKey: document.getElementById('api-key').value,
            apiProvider: document.getElementById('api-provider').value,
            allowEditOriginal: document.getElementById('allow-edit-original').checked,
            originalWidth: this.originalWidth,
            sidebarCollapsed: this.sidebarCollapsed
        };
        localStorage.setItem('markdown-translator-settings', JSON.stringify(settings));
    }

    toggleOriginalEdit() {
        this.saveSettings();
        const allowEdit = document.getElementById('allow-edit-original').checked;
        const originalBlocks = document.querySelectorAll('.original-block');
        
        originalBlocks.forEach(block => {
            if (allowEdit) {
                block.classList.add('editable');
                block.setAttribute('contenteditable', 'true');
            } else {
                block.classList.remove('editable');
                block.removeAttribute('contenteditable');
            }
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
            this.showError('请选择有效的Markdown文件（.md或.markdown）');
            return;
        }

        this.currentFile = file;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                this.parseMarkdown(e.target.result);
                this.updateFileInfo();
                document.getElementById('translate-all-btn').disabled = false;
                document.getElementById('export-btn').disabled = false;
            } catch (error) {
                this.showError('解析Markdown文件失败：' + error.message);
            }
        };
        
        reader.onerror = () => {
            this.showError('读取文件失败');
        };
        
        reader.readAsText(file, 'UTF-8');
    }

    parseMarkdown(content) {
        // 简单的Markdown段落分割
        const blocks = [];
        const lines = content.split('\n');
        let currentBlock = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 空行作为段落分隔符
            if (line.trim() === '') {
                if (currentBlock.trim()) {
                    blocks.push(currentBlock.trim());
                    currentBlock = '';
                }
            } else {
                if (currentBlock) {
                    currentBlock += '\n' + line;
                } else {
                    currentBlock = line;
                }
            }
        }
        
        // 处理最后一个块
        if (currentBlock.trim()) {
            blocks.push(currentBlock.trim());
        }

        // 过滤掉太短的块（比如只有一两个字符的）
        this.originalBlocks = blocks.filter(block => block.length > 3);
        this.translationBlocks = new Array(this.originalBlocks.length).fill('');
        
        this.renderBlocks();
    }

    renderBlocks() {
        const contentContainer = document.getElementById('content-container');
        
        contentContainer.innerHTML = '';
        
        this.originalBlocks.forEach((block, index) => {
            const pairDiv = this.createTextBlockPair(block, this.translationBlocks[index], index);
            contentContainer.appendChild(pairDiv);
        });
        
        this.toggleOriginalEdit();
    }

    createTextBlockPair(originalContent, translationContent, index) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'text-block-pair';
        pairDiv.dataset.index = index;
        
        // 原文块
        const originalDiv = document.createElement('div');
        originalDiv.className = 'original-block';
        originalDiv.innerHTML = this.renderMarkdownToHtml(originalContent || '');
        
        // 翻译按钮
        const translateBtn = document.createElement('button');
        translateBtn.className = 'translate-button';
        translateBtn.innerHTML = '→';
        translateBtn.title = '翻译此段';
        translateBtn.addEventListener('click', () => this.translateBlock(index));
        
        // 翻译块
        const translationDiv = document.createElement('div');
        translationDiv.className = 'translation-block';
        translationDiv.setAttribute('contenteditable', 'true');
        translationDiv.innerHTML = this.renderMarkdownToHtml(translationContent || '');
        translationDiv.addEventListener('input', () => {
            this.translationBlocks[index] = translationDiv.textContent;
        });
        
        pairDiv.appendChild(originalDiv);
        pairDiv.appendChild(translateBtn);
        pairDiv.appendChild(translationDiv);
        
        return pairDiv;
    }

    renderMarkdownToHtml(markdown) {
        if (!markdown) return '';
        
        // 简单的Markdown到HTML转换
        let html = markdown
            // 粗体
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            // 斜体
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            // 代码
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // 链接
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // 标题
            .replace(/^### (.*)/gm, '<h3>$1</h3>')
            .replace(/^## (.*)/gm, '<h2>$1</h2>')
            .replace(/^# (.*)/gm, '<h1>$1</h1>')
            // 换行
            .replace(/\n/g, '<br>');
            
        return html;
    }

    updateFileInfo() {
        const fileInfo = document.getElementById('file-info');
        if (this.currentFile) {
            fileInfo.textContent = `${this.currentFile.name} (${this.originalBlocks.length} 个段落)`;
        }
    }

    async translateBlock(index) {
        const translateBtn = document.querySelector(`[data-index="${index}"] .translate-button`);
        const originalContent = this.originalBlocks[index];
        
        if (!originalContent) return;
        
        const settings = JSON.parse(localStorage.getItem('markdown-translator-settings') || '{}');
        const apiKey = settings.apiKey;
        const prompt = settings.prompt;
        const provider = settings.apiProvider || 'openai';
        
        if (!apiKey) {
            this.showError('请先设置API Key');
            return;
        }
        
        translateBtn.disabled = true;
        translateBtn.classList.add('loading');
        
        try {
            const translation = await this.callTranslationAPI(originalContent, prompt, apiKey, provider);
            this.translationBlocks[index] = translation;
            
            // 更新翻译块的显示
            const translationBlock = document.querySelector(`[data-index="${index}"] .translation-block`);
            translationBlock.innerHTML = this.renderMarkdownToHtml(translation);
            
        } catch (error) {
            this.showError('翻译失败：' + error.message);
        } finally {
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
        }
    }

    async callTranslationAPI(text, prompt, apiKey, provider) {
        const fullPrompt = `${prompt}\n\n原文：\n${text}`;
        
        let apiUrl, headers, body;
        
        switch (provider) {
            case 'openai':
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                };
                body = {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                };
                break;
                
            case 'anthropic':
                apiUrl = 'https://api.anthropic.com/v1/messages';
                headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                body = {
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 2000,
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ]
                };
                break;
                
            default:
                throw new Error('不支持的API提供商');
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        
        if (provider === 'openai') {
            return data.choices[0]?.message?.content || '翻译失败';
        } else if (provider === 'anthropic') {
            return data.content[0]?.text || '翻译失败';
        }
        
        throw new Error('无法解析API响应');
    }

    async translateAll() {
        const settings = JSON.parse(localStorage.getItem('markdown-translator-settings') || '{}');
        const apiKey = settings.apiKey;
        
        if (!apiKey) {
            this.showError('请先设置API Key');
            return;
        }
        
        const translateAllBtn = document.getElementById('translate-all-btn');
        translateAllBtn.disabled = true;
        translateAllBtn.innerHTML = '<span class="loading-spinner"></span>翻译中...';
        
        try {
            for (let i = 0; i < this.originalBlocks.length; i++) {
                if (!this.translationBlocks[i]) { // 只翻译未翻译的块
                    await this.translateBlock(i);
                    // 添加延迟以避免API限制
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.showError('批量翻译失败：' + error.message);
        } finally {
            translateAllBtn.disabled = false;
            translateAllBtn.innerHTML = '全部翻译';
        }
    }

    exportTranslation() {
        if (!this.currentFile || this.translationBlocks.length === 0) {
            this.showError('没有可导出的翻译内容');
            return;
        }
        
        const translatedContent = this.translationBlocks
            .filter(block => block.trim())
            .join('\n\n');
            
        if (!translatedContent) {
            this.showError('没有已翻译的内容可导出');
            return;
        }
        
        const blob = new Blob([translatedContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `translated_${this.currentFile.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 设置调整大小功能
    setupResizer() {
        const resizeHandle = document.getElementById('resize-handle');
        const contentContainer = document.getElementById('content-container');
        
        if (!resizeHandle) return;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.isResizing = true;
            document.addEventListener('mousemove', this.handleResize.bind(this));
            document.addEventListener('mouseup', this.stopResize.bind(this));
        });
        
        // 应用保存的宽度设置
        this.applyLayoutSettings();
    }
    
    handleResize(e) {
        if (!this.isResizing) return;
        
        const contentContainer = document.getElementById('content-container');
        const rect = contentContainer.getBoundingClientRect();
        const containerWidth = rect.width - 60; // 减去翻译按钮的宽度
        const mouseX = e.clientX - rect.left;
        
        // 计算新的原文栏宽度百分比
        const newWidth = Math.max(20, Math.min(70, (mouseX / containerWidth) * 100));
        this.originalWidth = newWidth;
        
        this.applyLayoutSettings();
    }
    
    stopResize() {
        this.isResizing = false;
        document.removeEventListener('mousemove', this.handleResize.bind(this));
        document.removeEventListener('mouseup', this.stopResize.bind(this));
        this.saveSettings();
    }
    
    applyLayoutSettings() {
        document.documentElement.style.setProperty('--original-width', `${this.originalWidth}%`);
        
        const originalLabel = document.getElementById('original-label');
        if (originalLabel) {
            originalLabel.style.width = `${this.originalWidth}%`;
        }
        
        const resizeHandle = document.getElementById('resize-handle');
        if (resizeHandle) {
            resizeHandle.style.left = `${this.originalWidth}%`;
        }
    }
    
    // 设置侧边栏功能
    setupSidebar() {
        const settingsPanel = document.getElementById('settings-panel');
        if (this.sidebarCollapsed) {
            settingsPanel.classList.add('collapsed');
        }
    }
    
    toggleSidebar() {
        const settingsPanel = document.getElementById('settings-panel');
        this.sidebarCollapsed = !this.sidebarCollapsed;
        
        if (this.sidebarCollapsed) {
            settingsPanel.classList.add('collapsed');
        } else {
            settingsPanel.classList.remove('collapsed');
        }
        
        this.saveSettings();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new MarkdownTranslator();
});