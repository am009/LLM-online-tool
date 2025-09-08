class MarkdownTranslator {
    constructor() {
        this.originalBlocks = [];
        this.translationBlocks = [];
        this.currentFile = null;
        this.originalWidth = 45; // percentage
        this.isResizing = false;
        this.sidebarCollapsed = false;
        this.hasExported = false; // 标记是否已导出
        this.originalRenderMode = []; // 存储每个原文块的渲染模式：'markdown' 或 'mathjax'
        this.translationRenderMode = []; // 存储每个翻译块的渲染模式：'markdown' 或 'mathjax'
        this.activeTranslations = new Map(); // 存储正在进行的翻译请求的AbortController
        this.init();
    }

    async init() {
        // 等待语言管理器初始化完成
        if (!languageManager.isInitialized()) {
            await languageManager.init();
        }
        
        this.setupEventListeners();
        this.loadSettings();
        this.setupModal();
        this.setupSidebar();
        this.setupBeforeUnloadWarning();
        this.initLanguageSettings();
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
        document.getElementById('interface-language').addEventListener('change', (e) => this.onLanguageChange(e));
        
        // 上下文数量控制
        document.getElementById('context-count').addEventListener('input', () => this.saveSettings());
        
        // temperature控制
        document.getElementById('temperature').addEventListener('input', () => this.saveSettings());
        
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
            document.getElementById('translation-prompt').value = parsed.prompt || languageManager.get('ui.settingsPanel.translationPromptDefault');
            document.getElementById('api-key').value = parsed.apiKey || '';
            const provider = parsed.apiProvider || 'openai';
            document.getElementById('api-provider').value = provider;
            document.getElementById('context-count').value = (isNaN(parsed.contextCount) ? 1 : parsed.contextCount);
            
            // 加载temperature设置，如果没有设置则留空
            if (parsed.temperature !== undefined && parsed.temperature !== null && parsed.temperature !== '') {
                document.getElementById('temperature').value = parsed.temperature;
            } else {
                document.getElementById('temperature').value = '';
            }
            
            // 加载对应提供商的API端点
            this.loadApiEndpoint(provider);
            
            // 加载对应提供商的模型名称
            this.loadModelName(provider);
            
            // 加载布局设置
            this.originalWidth = parsed.originalWidth || 45;
            this.sidebarCollapsed = parsed.sidebarCollapsed || false;
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
        
        const contextCountValue = parseInt(document.getElementById('context-count').value);
        const temperatureValue = document.getElementById('temperature').value;
        
        const settings = {
            prompt: document.getElementById('translation-prompt').value,
            apiKey: document.getElementById('api-key').value,
            apiProvider: provider,
            contextCount: isNaN(contextCountValue) ? 1 : contextCountValue,
            originalWidth: this.originalWidth,
            sidebarCollapsed: this.sidebarCollapsed
        };
        
        // 只有当temperature有值时才保存
        if (temperatureValue !== null && temperatureValue !== undefined && temperatureValue.trim() !== '') {
            const tempFloat = parseFloat(temperatureValue);
            if (!isNaN(tempFloat)) {
                settings.temperature = tempFloat;
            }
        }
        
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

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
            this.showError(languageManager.get('errors.invalidFileType'));
            return;
        }

        this.currentFile = file;
        // 重置导出标记
        this.hasExported = false;
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                this.parseMarkdown(e.target.result);
                this.updateFileInfo();
                document.getElementById('translate-all-btn').disabled = false;
                document.getElementById('export-btn').disabled = false;
            } catch (error) {
                this.showError(languageManager.get('errors.parseMarkdownFailed') + error.message);
            }
        };
        
        reader.onerror = () => {
            this.showError(languageManager.get('errors.readFileFailed'));
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
        // 初始化渲染模式数组，原文默认为mathjax模式
        this.originalRenderMode = new Array(this.originalBlocks.length).fill('mathjax');
        this.translationRenderMode = new Array(this.originalBlocks.length).fill('markdown');
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
        
        // 初始化所有MathJax版本的渲染（但不显示）
        if (typeof MathJax !== 'undefined') {
            const mathjaxElements = document.querySelectorAll('.content-mathjax');
            MathJax.typesetPromise(mathjaxElements).catch((err) => console.log(err.message));
        }
    }

    createTextBlockPair(originalContent, translationContent, index) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'text-block-pair';
        pairDiv.dataset.index = index;
        
        // 原文块容器
        const originalContainer = document.createElement('div');
        originalContainer.className = 'original-block';
        
        // 原文块切换图标
        const originalToggle = document.createElement('button');
        originalToggle.className = 'render-toggle';
        // 根据默认渲染模式设置初始图标
        originalToggle.innerHTML = this.originalRenderMode[index] === 'mathjax' ? '∫' : '📝';
        originalToggle.title = this.originalRenderMode[index] === 'mathjax' ? '点击切换到Markdown文本' : '点击切换到MathJax渲染';
        originalToggle.addEventListener('click', () => this.toggleOriginalRenderMode(index));
        
        // 原文markdown版本
        const originalMarkdown = document.createElement('div');
        originalMarkdown.className = 'content-markdown';
        originalMarkdown.innerHTML = originalContent || '';
        // 根据默认渲染模式决定是否隐藏
        originalMarkdown.style.display = this.originalRenderMode[index] === 'markdown' ? 'block' : 'none';
        
        // 原文mathjax版本
        const originalMathjax = document.createElement('div');
        originalMathjax.className = 'content-mathjax tex2jax_process';
        originalMathjax.innerHTML = originalContent || '';
        // 根据默认渲染模式决定是否隐藏
        originalMathjax.style.display = this.originalRenderMode[index] === 'mathjax' ? 'block' : 'none';
        
        originalContainer.appendChild(originalToggle);
        originalContainer.appendChild(originalMarkdown);
        originalContainer.appendChild(originalMathjax);
        
        // 翻译按钮
        const translateBtn = document.createElement('button');
        translateBtn.className = 'translate-button';
        translateBtn.innerHTML = '→';
        translateBtn.title = '翻译此段';
        translateBtn.addEventListener('click', () => this.translateBlock(index));
        
        // 翻译块容器
        const translationContainer = document.createElement('div');
        translationContainer.className = 'translation-block';
        
        // 翻译块切换图标
        const translationToggle = document.createElement('button');
        translationToggle.className = 'render-toggle';
        translationToggle.innerHTML = '📝';
        translationToggle.title = '点击切换到MathJax渲染';
        translationToggle.addEventListener('click', () => this.toggleTranslationRenderMode(index));
        
        // 翻译markdown版本
        const translationMarkdown = document.createElement('div');
        translationMarkdown.className = 'content-markdown';
        translationMarkdown.setAttribute('contenteditable', 'true');
        translationMarkdown.innerHTML = translationContent || originalContent;
        translationMarkdown.addEventListener('input', () => {
            this.translationBlocks[index] = translationMarkdown.textContent;
            // 同步更新mathjax版本的内容
            translationMathjax.innerHTML = translationMarkdown.innerHTML;
            MathJax.typesetClear([translationMathjax]);
            // 重新渲染MathJax版本
            if (typeof MathJax !== 'undefined') {
                MathJax.typesetPromise([translationMathjax]).catch((err) => console.log(err.message));
            }
        });
        
        // 翻译mathjax版本
        const translationMathjax = document.createElement('div');
        translationMathjax.className = 'content-mathjax tex2jax_process';
        translationMathjax.innerHTML = translationContent || originalContent;
        translationMathjax.style.display = 'none';
        
        translationContainer.appendChild(translationToggle);
        translationContainer.appendChild(translationMarkdown);
        translationContainer.appendChild(translationMathjax);
        
        pairDiv.appendChild(originalContainer);
        pairDiv.appendChild(translateBtn);
        pairDiv.appendChild(translationContainer);
        
        return pairDiv;
    }

    updateFileInfo() {
        const fileInfo = document.getElementById('file-info');
        if (this.currentFile) {
            fileInfo.textContent = `${this.currentFile.name} (${this.originalBlocks.length} ${languageManager.get('messages.fileInfo')})`;
        }
    }

    getContextBlocks(targetIndex, contextCount) {
        const beforeBlocks = [];
        const afterBlocks = [];
        
        // 获取前文块
        for (let i = 1; i <= contextCount && targetIndex - i >= 0; i++) {
            beforeBlocks.unshift(this.originalBlocks[targetIndex - i]);
        }
        
        // 获取后文块
        for (let i = 1; i <= contextCount && targetIndex + i < this.originalBlocks.length; i++) {
            afterBlocks.push(this.originalBlocks[targetIndex + i]);
        }
        
        return {
            before: beforeBlocks.filter(block => block && block.trim()),
            after: afterBlocks.filter(block => block && block.trim())
        };
    }

    async translateBlock(index) {
        const translateBtn = document.querySelector(`[data-index="${index}"] .translate-button`);
        const originalContent = this.originalBlocks[index];
        
        if (!originalContent) return;

        // 如果已有正在进行的翻译，则中断它
        if (this.activeTranslations.has(index)) {
            this.activeTranslations.get(index).abort();
            this.activeTranslations.delete(index);
            translateBtn.innerHTML = '→';
            translateBtn.title = languageManager.get('ui.buttons.translate');
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
            return;
        }
        
        const settings = JSON.parse(localStorage.getItem('markdown-translator-settings') || '{}');
        const apiKey = settings.apiKey;
        const prompt = settings.prompt;
        const provider = settings.apiProvider || 'openai';
        const customEndpoint = document.getElementById('api-endpoint').value;
        const modelName = document.getElementById('model-name').value;
        const contextCountValue = parseInt(document.getElementById('context-count').value);
        const contextCount = isNaN(contextCountValue) ? 1 : contextCountValue;
        const temperatureValue = document.getElementById('temperature').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError(languageManager.get('errors.apiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            this.showError(languageManager.get('errors.modelNameRequired'));
            return;
        }
        
        // 创建AbortController用于中断请求
        const abortController = new AbortController();
        this.activeTranslations.set(index, abortController);
        
        // 更新按钮为中断状态
        translateBtn.innerHTML = '⏹';
        translateBtn.title = languageManager.get('ui.buttons.stopTranslation');
        translateBtn.disabled = false;
        translateBtn.classList.add('loading');
        
        try {
            // 获取上下文块
            const context = this.getContextBlocks(index, contextCount);
            
            const translation = await this.callTranslationAPI(
                originalContent, 
                prompt, 
                apiKey, 
                provider, 
                customEndpoint, 
                modelName, 
                context, 
                abortController,
                index,
                temperatureValue
            );
            
            if (translation) {
                this.translationBlocks[index] = translation;
                
                // 更新翻译块的显示
                const translationBlock = document.querySelector(`[data-index="${index}"] .translation-block`);
                const markdownDiv = translationBlock.querySelector('.content-markdown');
                const mathjaxDiv = translationBlock.querySelector('.content-mathjax');
                
                markdownDiv.innerHTML = translation;
                MathJax.typesetClear([markdownDiv]);
                mathjaxDiv.innerHTML = translation;

                // 重新渲染MathJax版本（无论当前显示的是哪个版本）
                if (typeof MathJax !== 'undefined') {
                    MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                }
                
                // 有新翻译内容时，重置导出标记
                this.hasExported = false;
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showError(languageManager.get('errors.translationFailed') + error.message);
            }
        } finally {
            // 清理状态
            this.activeTranslations.delete(index);
            translateBtn.innerHTML = '→';
            translateBtn.title = languageManager.get('ui.buttons.translate');
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
        }
    }

    async callTranslationAPI(text, prompt, apiKey, provider, customEndpoint, modelName, context = null, abortController = null, blockIndex = null, temperature = null) {
        let fullPrompt = prompt;
        
        // 构建包含上下文的完整提示
        if (context && (context.before.length > 0 || context.after.length > 0)) {
            fullPrompt += '\n\n';
            
            if (context.before.length > 0) {
                fullPrompt += '前文：\n' + context.before.join('\n\n') + '\n\n';
            }
            
            fullPrompt += '原文：\n' + text;
            
            // 暂时不加入后文
            // if (context.after.length > 0) {
            //     fullPrompt += '\n\n后文：\n' + context.after.join('\n\n');
            // }
        } else {
            fullPrompt += '\n\n原文：\n' + text;
        }
        
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
                    throw new Error(languageManager.get('errors.unsupportedApiProvider'));
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
                    max_tokens: 2000
                };
                
                // 只有当temperature有值时才添加到请求中
                if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
                    const tempFloat = parseFloat(temperature);
                    if (!isNaN(tempFloat)) {
                        body.temperature = tempFloat;
                    }
                }
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
                
                // 只有当temperature有值时才添加到请求中
                if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
                    const tempFloat = parseFloat(temperature);
                    if (!isNaN(tempFloat)) {
                        body.temperature = tempFloat;
                    }
                }
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
                    stream: true  // 启用流式输出
                };
                
                // 只有当temperature有值时才添加到请求中
                if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
                    const tempFloat = parseFloat(temperature);
                    if (!isNaN(tempFloat)) {
                        body.options = body.options || {};
                        body.options.temperature = tempFloat;
                    }
                }
                break;
                
            default:
                throw new Error('不支持的API提供商');
        }
        
        const fetchOptions = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        };
        
        // 添加AbortController信号
        if (abortController) {
            fetchOptions.signal = abortController.signal;
        }
        
        const response = await fetch(apiUrl, fetchOptions);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`${languageManager.get('errors.apiRequestFailed')}: ${response.status} - ${error}`);
        }
        
        // 处理流式响应（仅适用于Ollama）
        if (provider === 'ollama' && body.stream) {
            return await this.handleOllamaStreamResponse(response, blockIndex);
        }
        
        // 处理非流式响应
        const data = await response.json();
        
        // 根据提供商类型解析响应
        if (provider === 'openai' || provider === 'custom') {
            return data.choices[0]?.message?.content || languageManager.get('errors.translationFailed');
        } else if (provider === 'anthropic') {
            return data.content[0]?.text || languageManager.get('errors.translationFailed');
        } else if (provider === 'ollama') {
            return data.message?.content || languageManager.get('errors.translationFailed');
        }
        
        throw new Error(languageManager.get('errors.parseApiResponseFailed'));
    }

    async handleOllamaStreamResponse(response, blockIndex) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        
        // 获取对应的翻译块DOM元素
        let translationBlock, markdownDiv, mathjaxDiv;
        if (blockIndex !== null) {
            translationBlock = document.querySelector(`[data-index="${blockIndex}"] .translation-block`);
            markdownDiv = translationBlock?.querySelector('.content-markdown');
            mathjaxDiv = translationBlock?.querySelector('.content-mathjax');
        }
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.message && data.message.content) {
                            result += data.message.content;
                            
                            // 实时更新界面显示
                            if (markdownDiv && blockIndex !== null) {
                                markdownDiv.innerHTML = result;
                                this.translationBlocks[blockIndex] = result;
                                
                                // 同步更新mathjax版本
                                if (mathjaxDiv) {
                                    mathjaxDiv.innerHTML = result;
                                    MathJax.typesetClear([mathjaxDiv]);
                                    
                                    // 如果当前显示的是MathJax模式，重新渲染
                                    if (this.translationRenderMode[blockIndex] === 'mathjax') {
                                        if (typeof MathJax !== 'undefined') {
                                            MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (data.done) {
                            break;
                        }
                    } catch (e) {
                        // 忽略JSON解析错误，继续处理下一行
                        continue;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        return result || languageManager.get('errors.translationFailed');
    }

    async translateAll() {
        const settings = JSON.parse(localStorage.getItem('markdown-translator-settings') || '{}');
        const apiKey = settings.apiKey;
        const provider = settings.apiProvider || 'openai';
        const modelName = document.getElementById('model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError(languageManager.get('errors.apiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            this.showError(languageManager.get('errors.modelNameRequired'));
            return;
        }
        
        const translateAllBtn = document.getElementById('translate-all-btn');
        translateAllBtn.disabled = true;
        translateAllBtn.innerHTML = '<span class="loading-spinner"></span>' + languageManager.get('messages.translating');
        
        try {
            for (let i = 0; i < this.originalBlocks.length; i++) {
                if (!this.translationBlocks[i]) { // 只翻译未翻译的块
                    await this.translateBlock(i);
                    // 添加延迟以避免API限制
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.showError(languageManager.get('errors.batchTranslationFailed') + error.message);
        } finally {
            translateAllBtn.disabled = false;
            translateAllBtn.innerHTML = languageManager.get('ui.buttons.translateAll');
        }
    }

    exportTranslation() {
        if (!this.currentFile || this.translationBlocks.length === 0) {
            this.showError(languageManager.get('errors.noTranslationContent'));
            return;
        }
        
        const translatedContent = this.translationBlocks
            .filter(block => block.trim())
            .join('\n\n');
            
        if (!translatedContent) {
            this.showError(languageManager.get('errors.noTranslatedContent'));
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
        
        // 标记为已导出
        this.hasExported = true;
    }

    
    setupBeforeUnloadWarning() {
        window.addEventListener('beforeunload', (e) => {
            // 检查是否有翻译内容且未导出
            if (this.hasTranslatedContent() && !this.hasExported) {
                const message = languageManager.get('messages.beforeUnloadWarning');
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });
    }
    
    hasTranslatedContent() {
        if (!this.translationBlocks || this.translationBlocks.length === 0) {
            return false;
        }
        
        // 检查是否有任何翻译内容与原文不同
        return this.translationBlocks.some((translation, index) => {
            const original = this.originalBlocks[index] || '';
            return translation && translation.trim() !== '' && translation.trim() !== original.trim();
        });
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

    // 切换原文块的渲染模式
    toggleOriginalRenderMode(index) {
        if (this.originalRenderMode[index] === 'markdown') {
            this.originalRenderMode[index] = 'mathjax';
        } else {
            this.originalRenderMode[index] = 'markdown';
        }
        this.updateBlockDisplay(index, 'original');
    }

    // 切换翻译块的渲染模式
    toggleTranslationRenderMode(index) {
        if (this.translationRenderMode[index] === 'markdown') {
            this.translationRenderMode[index] = 'mathjax';
        } else {
            this.translationRenderMode[index] = 'markdown';
        }
        this.updateBlockDisplay(index, 'translation');
    }

    // 更新块的显示模式
    updateBlockDisplay(index, blockType) {
        const pair = document.querySelector(`[data-index="${index}"]`);
        if (!pair) return;
        
        if (blockType === 'original') {
            const container = pair.querySelector('.original-block');
            const toggle = container.querySelector('.render-toggle');
            const markdownDiv = container.querySelector('.content-markdown');
            const mathjaxDiv = container.querySelector('.content-mathjax');
            const mode = this.originalRenderMode[index];
            
            if (mode === 'markdown') {
                toggle.innerHTML = '📝';
                toggle.title = languageManager.get('ui.tooltips.toggleToMathJax');
                markdownDiv.style.display = 'block';
                mathjaxDiv.style.display = 'none';
            } else {
                toggle.innerHTML = '∫';
                toggle.title = languageManager.get('ui.tooltips.toggleToMarkdown');
                markdownDiv.style.display = 'none';
                mathjaxDiv.style.display = 'block';
                // 触发MathJax渲染
                if (typeof MathJax !== 'undefined') {
                    MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                }
            }
        } else {
            const container = pair.querySelector('.translation-block');
            const toggle = container.querySelector('.render-toggle');
            const markdownDiv = container.querySelector('.content-markdown');
            const mathjaxDiv = container.querySelector('.content-mathjax');
            const mode = this.translationRenderMode[index];
            
            if (mode === 'markdown') {
                toggle.innerHTML = '📝';
                toggle.title = languageManager.get('ui.tooltips.toggleToMathJax');
                markdownDiv.style.display = 'block';
                mathjaxDiv.style.display = 'none';
            } else {
                toggle.innerHTML = '∫';
                toggle.title = languageManager.get('ui.tooltips.toggleToMarkdown');
                markdownDiv.style.display = 'none';
                mathjaxDiv.style.display = 'block';
                // 触发MathJax渲染
                if (typeof MathJax !== 'undefined') {
                    MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                }
            }
        }
    }

    initLanguageSettings() {
        // 设置语言选择器的当前值
        const languageSelect = document.getElementById('interface-language');
        languageSelect.value = languageManager.getCurrentLanguage();
        
        // 监听语言变更事件
        window.addEventListener('languageChanged', () => {
            this.updateDynamicTranslations();
        });
    }

    async onLanguageChange(event) {
        const newLanguage = event.target.value;
        await languageManager.switchLanguage(newLanguage);
    }

    updateDynamicTranslations() {
        // 更新文件信息显示
        this.updateFileInfo();
        
        // 更新按钮文本
        const translateAllBtn = document.getElementById('translate-all-btn');
        if (translateAllBtn.innerHTML.includes('loading-spinner')) {
            translateAllBtn.innerHTML = '<span class="loading-spinner"></span>' + languageManager.get('messages.translating');
        } else {
            translateAllBtn.innerHTML = languageManager.get('ui.buttons.translateAll');
        }
        
        // 更新翻译提示词默认值（如果当前为空或默认值）
        const promptTextarea = document.getElementById('translation-prompt');
        const currentPrompt = promptTextarea.value.trim();
        if (!currentPrompt || currentPrompt === '请将以下文本翻译成中文，保持原文的格式和结构，不要添加额外的解释或注释。' || currentPrompt === 'Please translate the following text to English, maintaining the original format and structure, without adding additional explanations or comments.') {
            promptTextarea.value = languageManager.get('ui.settingsPanel.translationPromptDefault');
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    new MarkdownTranslator();
});