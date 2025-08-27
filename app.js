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
        document.getElementById('api-endpoint').addEventListener('input', () => this.saveSettings());
        document.getElementById('model-name').addEventListener('input', () => this.saveSettings());
        document.getElementById('api-provider').addEventListener('change', () => this.onProviderChange());
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
            const provider = parsed.apiProvider || 'openai';
            document.getElementById('api-provider').value = provider;
            document.getElementById('allow-edit-original').checked = parsed.allowEditOriginal || false;
            
            // 加载对应提供商的API端点
            this.loadApiEndpoint(provider);
            
            // 加载对应提供商的模型名称
            this.loadModelName(provider);
            
            // 加载布局设置
            this.originalWidth = parsed.originalWidth || 45;
            this.sidebarCollapsed = parsed.sidebarCollapsed || false;
            this.applyLayoutSettings();
        } else {
            // 初次使用时加载默认端点和模型
            this.loadApiEndpoint('openai');
            this.loadModelName('openai');
        }
    }

    saveSettings() {
        const provider = document.getElementById('api-provider').value;
        const endpoint = document.getElementById('api-endpoint').value;
        const modelName = document.getElementById('model-name').value;
        
        // 保存当前提供商的API端点
        this.saveApiEndpoint(provider, endpoint);
        
        // 保存当前提供商的模型名称
        this.saveModelName(provider, modelName);
        
        const settings = {
            prompt: document.getElementById('translation-prompt').value,
            apiKey: document.getElementById('api-key').value,
            apiProvider: provider,
            allowEditOriginal: document.getElementById('allow-edit-original').checked,
            originalWidth: this.originalWidth,
            sidebarCollapsed: this.sidebarCollapsed
        };
        localStorage.setItem('markdown-translator-settings', JSON.stringify(settings));
    }

    onProviderChange() {
        const provider = document.getElementById('api-provider').value;
        this.loadApiEndpoint(provider);
        this.loadModelName(provider);
        this.saveSettings();
    }

    loadApiEndpoint(provider) {
        const endpoints = this.getStoredEndpoints();
        const defaultEndpoints = {
            'openai': 'https://api.openai.com/v1/chat/completions',
            'anthropic': 'https://api.anthropic.com/v1/messages',
            'ollama': 'http://localhost:11434/api/chat',
            'custom': ''
        };
        
        const endpoint = endpoints[provider] || defaultEndpoints[provider] || '';
        document.getElementById('api-endpoint').value = endpoint;
    }

    saveApiEndpoint(provider, endpoint) {
        const endpoints = this.getStoredEndpoints();
        endpoints[provider] = endpoint;
        localStorage.setItem('markdown-translator-endpoints', JSON.stringify(endpoints));
    }

    getStoredEndpoints() {
        const stored = localStorage.getItem('markdown-translator-endpoints');
        return stored ? JSON.parse(stored) : {};
    }

    loadModelName(provider) {
        const models = this.getStoredModels();
        const defaultModels = {
            'openai': 'gpt-3.5-turbo',
            'anthropic': 'claude-3-sonnet-20240229',
            'ollama': 'llama2',
            'custom': ''
        };
        
        const model = models[provider] || defaultModels[provider] || '';
        document.getElementById('model-name').value = model;
    }

    saveModelName(provider, modelName) {
        const models = this.getStoredModels();
        models[provider] = modelName;
        localStorage.setItem('markdown-translator-models', JSON.stringify(models));
    }

    getStoredModels() {
        const stored = localStorage.getItem('markdown-translator-models');
        return stored ? JSON.parse(stored) : {};
    }

    toggleOriginalEdit() {
        this.saveSettings();
        const allowEdit = document.getElementById('allow-edit-original').checked;
        const originalBlocks = document.querySelectorAll('.original-block');
        
        originalBlocks.forEach((block, index) => {
            if (allowEdit) {
                // 切换到可编辑模式：清除MathJax渲染，恢复原始文本
                block.classList.add('editable');
                block.setAttribute('contenteditable', 'true');
                block.classList.add('tex2jax_ignore');
                block.classList.remove('tex2jax_process');
                
                // 恢复原始文本内容（清除MathJax渲染）
                if (this.originalBlocks[index]) {
                    block.innerHTML = this.originalBlocks[index];
                }
            } else {
                // 切换到只读模式：准备MathJax渲染
                block.classList.remove('editable');
                block.removeAttribute('contenteditable');
                block.classList.remove('tex2jax_ignore');
                block.classList.add('tex2jax_process');
                
                // 确保内容是原始文本
                if (this.originalBlocks[index]) {
                    block.innerHTML = this.originalBlocks[index];
                }
            }
        });
        
        // 重新渲染 MathJax（仅在非编辑模式下）
        if (typeof MathJax !== 'undefined' && !allowEdit) {
            MathJax.typesetPromise(originalBlocks).catch((err) => console.log(err.message));
        }
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
        for (let i = 0; i < this.originalBlocks.length; i++) {
            this.translationBlocks[i] = this.originalBlocks[i]
        }
        
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
        
        // 渲染 MathJax 公式（如果原文不允许编辑）
        const allowEdit = document.getElementById('allow-edit-original').checked;
        if (typeof MathJax !== 'undefined' && !allowEdit) {
            const originalBlocks = document.querySelectorAll('.original-block');
            MathJax.typesetPromise(originalBlocks).catch((err) => console.log(err.message));
        }
    }

    createTextBlockPair(originalContent, translationContent, index) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'text-block-pair';
        pairDiv.dataset.index = index;
        
        // 原文块
        const originalDiv = document.createElement('div');
        originalDiv.className = 'original-block';
        originalDiv.innerHTML = originalContent || '';
        
        // 根据是否允许编辑设置 MathJax 处理类
        const allowEdit = document.getElementById('allow-edit-original').checked;
        if (allowEdit) {
            originalDiv.classList.add('tex2jax_ignore');
        } else {
            originalDiv.classList.add('tex2jax_process');
        }
        
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
        translationDiv.innerHTML = translationContent || originalContent;
        translationDiv.addEventListener('input', () => {
            this.translationBlocks[index] = translationDiv.textContent;
        });
        
        pairDiv.appendChild(originalDiv);
        pairDiv.appendChild(translateBtn);
        pairDiv.appendChild(translationDiv);
        
        return pairDiv;
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
        const customEndpoint = document.getElementById('api-endpoint').value;
        const modelName = document.getElementById('model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError('请先设置API Key');
            return;
        }
        
        if (!modelName) {
            this.showError('请先设置模型名称');
            return;
        }
        
        translateBtn.disabled = true;
        translateBtn.classList.add('loading');
        
        try {
            const translation = await this.callTranslationAPI(originalContent, prompt, apiKey, provider, customEndpoint, modelName);
            this.translationBlocks[index] = translation;
            
            // 更新翻译块的显示
            const translationBlock = document.querySelector(`[data-index="${index}"] .translation-block`);
            translationBlock.innerHTML = translation;
            
        } catch (error) {
            this.showError('翻译失败：' + error.message);
        } finally {
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
        }
    }

    async callTranslationAPI(text, prompt, apiKey, provider, customEndpoint, modelName) {
        const fullPrompt = `${prompt}\n\n原文：\n${text}`;
        
        let apiUrl, headers, body;
        
        // 如果有自定义端点，使用自定义端点，否则使用默认端点
        if (customEndpoint && customEndpoint.trim()) {
            apiUrl = customEndpoint.trim();
        } else {
            // 使用默认端点
            switch (provider) {
                case 'openai':
                    apiUrl = 'https://api.openai.com/v1/chat/completions';
                    break;
                case 'anthropic':
                    apiUrl = 'https://api.anthropic.com/v1/messages';
                    break;
                case 'ollama':
                    apiUrl = 'http://localhost:11434/api/chat';
                    break;
                default:
                    throw new Error('不支持的API提供商');
            }
        }
        
        // 设置请求头和请求体
        switch (provider) {
            case 'openai':
            case 'custom': // 自定义端点也可以使用OpenAI格式
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                };
                body = {
                    model: modelName || 'gpt-3.5-turbo',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                };
                break;
                
            case 'anthropic':
                headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                body = {
                    model: modelName || 'claude-3-sonnet-20240229',
                    max_tokens: 2000,
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ]
                };
                break;
                
            case 'ollama':
                headers = {
                    'Content-Type': 'application/json'
                };
                body = {
                    model: modelName || 'llama2',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    stream: false
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
        
        // 根据提供商类型解析响应
        if (provider === 'openai' || provider === 'custom') {
            return data.choices[0]?.message?.content || '翻译失败';
        } else if (provider === 'anthropic') {
            return data.content[0]?.text || '翻译失败';
        } else if (provider === 'ollama') {
            return data.message?.content || '翻译失败';
        }
        
        throw new Error('无法解析API响应');
    }

    async translateAll() {
        const settings = JSON.parse(localStorage.getItem('markdown-translator-settings') || '{}');
        const apiKey = settings.apiKey;
        const provider = settings.apiProvider || 'openai';
        const modelName = document.getElementById('model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError('请先设置API Key');
            return;
        }
        
        if (!modelName) {
            this.showError('请先设置模型名称');
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
        a.download = this.currentFile.name.startsWith('translated_') 
            ? this.currentFile.name 
            : `translated_${this.currentFile.name}`;
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