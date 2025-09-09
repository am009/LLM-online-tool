class MarkdownTranslator {
    constructor() {
        this.originalBlocks = [];
        this.translationBlocks = [];
        this.currentFile = null;
        this.isResizing = false;
        this.sidebarCollapsed = false;
        this.hasExported = false; // 标记是否已导出
        this.originalRenderMode = []; // 存储每个原文块的渲染模式：'markdown' 或 'mathjax'
        this.translationRenderMode = []; // 存储每个翻译块的渲染模式：'markdown' 或 'mathjax'
        this.activeTranslations = new Map(); // 存储正在进行的翻译请求的AbortController
        this.activeProofreadings = new Map(); // 存储正在进行的校对请求的AbortController
        this.proofreadingMode = false; // 校对模式标志
        this.isTranslatingAll = false; // 跟踪是否正在进行全部翻译
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

        // 保存进度
        document.getElementById('save-progress-btn').addEventListener('click', () => this.saveProgress());

        // 加载进度
        const loadProgressBtn = document.getElementById('load-progress-btn');
        const progressInput = document.getElementById('progress-input');
        
        loadProgressBtn.addEventListener('click', () => progressInput.click());
        progressInput.addEventListener('change', (e) => this.handleProgressUpload(e));

        // 导出原文
        document.getElementById('export-original-btn').addEventListener('click', () => this.exportOriginal());
        
        // 导出交替翻译结果
        document.getElementById('export-alternating-btn').addEventListener('click', () => this.exportAlternatingTranslation());

        // 全部翻译
        document.getElementById('translate-all-btn').addEventListener('click', () => this.translateAll());

        // 校对功能
        document.getElementById('proofreading-mode').addEventListener('change', (e) => this.onProofreadingModeChange(e));
        document.getElementById('proofread-all-btn').addEventListener('click', () => this.proofreadAll());

        // 段落重新划分功能
        document.getElementById('reorganize-paragraphs-btn').addEventListener('click', () => this.reorganizeParagraphs());
        document.getElementById('paragraph-char-limit').addEventListener('input', () => this.saveSettings());

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
        
        // thinking控制
        document.getElementById('enable-thinking').addEventListener('change', () => this.saveSettings());
        
        // 校对设置变更
        document.getElementById('proofread-prompt').addEventListener('input', () => this.saveSettings());
        document.getElementById('proofread-api-key').addEventListener('input', () => this.saveSettings());
        document.getElementById('proofread-api-endpoint').addEventListener('input', () => this.saveSettings());
        document.getElementById('proofread-model-name').addEventListener('input', () => this.saveSettings());
        document.getElementById('proofread-api-provider').addEventListener('change', () => this.onProofreadProviderChange());
        document.getElementById('proofread-temperature').addEventListener('input', () => this.saveSettings());
        
        // 校对thinking控制
        document.getElementById('proofread-enable-thinking').addEventListener('change', () => this.saveSettings());
        
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
        const currentLanguage = languageManager.getCurrentLanguage();
        const settingsKey = `markdown-translator-settings-${currentLanguage}`;
        const settings = localStorage.getItem(settingsKey);
        
        if (settings) {
            const parsed = JSON.parse(settings);
            document.getElementById('translation-prompt').value = parsed.prompt ?? languageManager.get('ui.settingsPanel.translationPromptDefault');
            document.getElementById('api-key').value = parsed.apiKey ?? '';
            const provider = parsed.apiProvider ?? 'ollama';
            document.getElementById('api-provider').value = provider;
            document.getElementById('context-count').value = (isNaN(parsed.contextCount) ? 1 : parsed.contextCount);
            
            // 加载段落字符数限制设置
            document.getElementById('paragraph-char-limit').value = parsed.paragraphCharLimit ?? 0;
            
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
            this.sidebarCollapsed = parsed.sidebarCollapsed ?? false;
            
            // 加载校对设置
            this.proofreadingMode = parsed.proofreadingMode ?? false;
            if (parsed.proofreadPrompt) {
                document.getElementById('proofread-prompt').value = parsed.proofreadPrompt;
            }
            if (parsed.proofreadApiKey) {
                document.getElementById('proofread-api-key').value = parsed.proofreadApiKey;
            }
            const proofreadProvider = parsed.proofreadApiProvider ?? 'ollama';
            document.getElementById('proofread-api-provider').value = proofreadProvider;
            
            if (parsed.proofreadTemperature !== undefined && parsed.proofreadTemperature !== null && parsed.proofreadTemperature !== '') {
                document.getElementById('proofread-temperature').value = parsed.proofreadTemperature;
            }
            
            // 加载thinking设置
            document.getElementById('enable-thinking').checked = parsed.enableThinking ?? false;
            document.getElementById('proofread-enable-thinking').checked = parsed.proofreadEnableThinking ?? false;
            
            // 设置校对模式状态
            document.getElementById('proofreading-mode').checked = this.proofreadingMode;
            this.onProofreadingModeChange({ target: { checked: this.proofreadingMode } });
            
            // 加载对应提供商的校对API端点
            this.loadProofreadApiEndpoint(proofreadProvider);
            // 加载对应提供商的校对模型名称
            this.loadProofreadModelName(proofreadProvider);
        } else {
            // 初次使用时加载默认端点和模型
            this.loadApiEndpoint('openai');
            this.loadModelName('openai');
            // 初次使用时加载默认校对设置
            this.loadProofreadApiEndpoint('openai');
            this.loadProofreadModelName('openai');
            // 设置默认翻译提示词
            document.getElementById('translation-prompt').value = languageManager.get('ui.settingsPanel.translationPromptDefault');
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
        
        // 保存校对提供商的设置
        const proofreadProvider = document.getElementById('proofread-api-provider').value;
        const proofreadEndpoint = document.getElementById('proofread-api-endpoint').value;
        const proofreadModelName = document.getElementById('proofread-model-name').value;
        
        this.saveProofreadApiEndpoint(proofreadProvider, proofreadEndpoint);
        this.saveProofreadModelName(proofreadProvider, proofreadModelName);
        
        const contextCountValue = parseInt(document.getElementById('context-count').value);
        const paragraphCharLimitValue = parseInt(document.getElementById('paragraph-char-limit').value);
        const temperatureValue = document.getElementById('temperature').value;
        
        const settings = {
            prompt: document.getElementById('translation-prompt').value,
            apiKey: document.getElementById('api-key').value,
            apiProvider: provider,
            contextCount: isNaN(contextCountValue) ? 1 : contextCountValue,
            paragraphCharLimit: isNaN(paragraphCharLimitValue) ? 0 : paragraphCharLimitValue,
            sidebarCollapsed: this.sidebarCollapsed,
            enableThinking: document.getElementById('enable-thinking').checked,
            // 校对设置
            proofreadingMode: this.proofreadingMode,
            proofreadPrompt: document.getElementById('proofread-prompt').value,
            proofreadApiKey: document.getElementById('proofread-api-key').value,
            proofreadApiProvider: document.getElementById('proofread-api-provider').value,
            proofreadEnableThinking: document.getElementById('proofread-enable-thinking').checked
        };
        
        // 只有当temperature有值时才保存
        if (temperatureValue !== null && temperatureValue !== undefined && temperatureValue.trim() !== '') {
            const tempFloat = parseFloat(temperatureValue);
            if (!isNaN(tempFloat)) {
                settings.temperature = tempFloat;
            }
        }
        
        // 只有当校对temperature有值时才保存
        const proofreadTemperatureValue = document.getElementById('proofread-temperature').value;
        if (proofreadTemperatureValue !== null && proofreadTemperatureValue !== undefined && proofreadTemperatureValue.trim() !== '') {
            const proofreadTempFloat = parseFloat(proofreadTemperatureValue);
            if (!isNaN(proofreadTempFloat)) {
                settings.proofreadTemperature = proofreadTempFloat;
            }
        }
        
        // 按语言分别保存设置
        const currentLanguage = languageManager.getCurrentLanguage();
        const settingsKey = `markdown-translator-settings-${currentLanguage}`;
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }

    onProviderChange() {
        const provider = document.getElementById('api-provider').value;
        this.loadApiEndpoint(provider);
        this.loadModelName(provider);
        this.saveSettings();
    }

    onProofreadProviderChange() {
        const provider = document.getElementById('proofread-api-provider').value;
        this.loadProofreadApiEndpoint(provider);
        this.loadProofreadModelName(provider);
        this.saveSettings();
    }

    onProofreadingModeChange(event) {
        this.proofreadingMode = event.target.checked;
        const settingsGroup = document.getElementById('proofreading-settings-group');
        const proofreadAllBtn = document.getElementById('proofread-all-btn');
        
        if (this.proofreadingMode) {
            settingsGroup.style.display = 'block';
            // 切换所有翻译按钮为校对按钮
            this.switchToProofreadingMode();
            if (this.originalBlocks && this.originalBlocks.length > 0) {
                proofreadAllBtn.disabled = false;
            }
        } else {
            settingsGroup.style.display = 'none';
            // 切换所有校对按钮为翻译按钮
            this.switchToTranslationMode();
            proofreadAllBtn.disabled = true;
        }
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
        
        const endpoint = endpoints[provider] ?? defaultEndpoints[provider] ?? '';
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
        
        const model = models[provider] ?? defaultModels[provider] ?? '';
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

    loadProofreadApiEndpoint(provider) {
        const endpoints = this.getStoredProofreadEndpoints();
        const defaultEndpoints = {
            'openai': 'https://api.openai.com/v1/chat/completions',
            'anthropic': 'https://api.anthropic.com/v1/messages',
            'ollama': 'http://localhost:11434/api/chat',
            'custom': ''
        };
        
        const endpoint = endpoints[provider] ?? defaultEndpoints[provider] ?? '';
        document.getElementById('proofread-api-endpoint').value = endpoint;
    }

    saveProofreadApiEndpoint(provider, endpoint) {
        const endpoints = this.getStoredProofreadEndpoints();
        endpoints[provider] = endpoint;
        localStorage.setItem('markdown-translator-proofread-endpoints', JSON.stringify(endpoints));
    }

    getStoredProofreadEndpoints() {
        const stored = localStorage.getItem('markdown-translator-proofread-endpoints');
        return stored ? JSON.parse(stored) : {};
    }

    loadProofreadModelName(provider) {
        const models = this.getStoredProofreadModels();
        const defaultModels = {
            'openai': 'gpt-4',
            'anthropic': 'claude-3-sonnet-20240229',
            'ollama': 'llama2',
            'custom': ''
        };
        
        const model = models[provider] ?? defaultModels[provider] ?? '';
        document.getElementById('proofread-model-name').value = model;
    }

    saveProofreadModelName(provider, modelName) {
        const models = this.getStoredProofreadModels();
        models[provider] = modelName;
        localStorage.setItem('markdown-translator-proofread-models', JSON.stringify(models));
    }

    getStoredProofreadModels() {
        const stored = localStorage.getItem('markdown-translator-proofread-models');
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
                this.parseContent(e.target.result);
                this.updateFileInfo();
                document.getElementById('translate-all-btn').disabled = false;
                document.getElementById('export-btn').disabled = false;
                document.getElementById('export-alternating-btn').disabled = false;
                document.getElementById('save-progress-btn').disabled = false;
                document.getElementById('export-original-btn').disabled = false;
                document.getElementById('reorganize-paragraphs-btn').disabled = false;
                // 如果处于校对模式，启用校对所有按钮
                if (this.proofreadingMode) {
                    document.getElementById('proofread-all-btn').disabled = false;
                }
            } catch (error) {
                this.showError(languageManager.get('errors.parseMarkdownFailed') + error.message);
            }
        };
        
        reader.onerror = () => {
            this.showError(languageManager.get('errors.readFileFailed'));
        };
        
        reader.readAsText(file, 'UTF-8');
    }

    parseContent(content) {
        // 先将CRLF换行转换为LF换行，然后将只有空白字符的行转为空行
        const normalizedContent = content
            .replace(/\r\n/g, '\n')
            .replace(/^[ \t]+$/gm, '');
        
        // 按照两个及以上的连续换行分割段落
        const blocks = normalizedContent.split(/\n{2,}/)
            .map(block => block.trim())
            .filter(block => block.length > 0);
            
        this.originalBlocks = blocks;
        this.translationBlocks = new Array(blocks.length).fill('');
        // 初始化渲染模式数组，原文默认为mathjax模式
        this.originalRenderMode = new Array(this.originalBlocks.length).fill('mathjax');
        this.translationRenderMode = new Array(this.originalBlocks.length).fill('markdown');
        
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
        if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
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
        originalToggle.title = this.originalRenderMode[index] === 'mathjax' ? languageManager.get('ui.tooltips.toggleToMarkdown') : languageManager.get('ui.tooltips.toggleToMathJax');
        originalToggle.addEventListener('click', () => this.toggleOriginalRenderMode(index));
        
        // 原文markdown版本
        const originalMarkdown = document.createElement('textarea');
        originalMarkdown.className = 'content-markdown';
        originalMarkdown.value = originalContent;
        originalMarkdown.setAttribute('oninput', 'this.style.height = "";this.style.height = this.scrollHeight + "px"');
        // 根据默认渲染模式决定是否隐藏
        originalMarkdown.style.display = this.originalRenderMode[index] === 'markdown' ? 'block' : 'none';
        
        // 初始化高度
        setTimeout(() => {
            originalMarkdown.style.height = '';
            originalMarkdown.style.height = originalMarkdown.scrollHeight + 'px';
        }, 0);
        
        originalMarkdown.addEventListener('input', () => {
            this.originalBlocks[index] = originalMarkdown.value;
            // 同步更新mathjax版本的内容
            originalMathjax.innerHTML = originalMarkdown.value;
            // 重新渲染MathJax版本
            if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
                MathJax.typesetPromise([originalMathjax]).catch((err) => console.log(err.message));
            }
        });
        
        // 原文mathjax版本
        const originalMathjax = document.createElement('div');
        originalMathjax.className = 'content-mathjax tex2jax_process';
        originalMathjax.innerHTML = originalContent;
        // 根据默认渲染模式决定是否隐藏
        originalMathjax.style.display = this.originalRenderMode[index] === 'mathjax' ? 'block' : 'none';
        
        originalContainer.appendChild(originalToggle);
        originalContainer.appendChild(originalMarkdown);
        originalContainer.appendChild(originalMathjax);
        
        // 翻译按钮
        const translateBtn = document.createElement('button');
        translateBtn.className = 'translate-button';
        translateBtn.innerHTML = this.proofreadingMode ? '✓' : '→';
        translateBtn.title = this.proofreadingMode ? languageManager.get('ui.tooltips.proofreadParagraph') : languageManager.get('ui.tooltips.translateParagraph');
        translateBtn.addEventListener('click', () => {
            if (this.proofreadingMode) {
                this.proofreadBlock(index);
            } else {
                this.translateBlock(index);
            }
        });
        
        // 翻译块容器
        const translationContainer = document.createElement('div');
        translationContainer.className = 'translation-block';
        
        // 翻译块切换图标
        const translationToggle = document.createElement('button');
        translationToggle.className = 'render-toggle';
        translationToggle.innerHTML = '📝';
        translationToggle.title = languageManager.get('ui.tooltips.toggleToMathJax');
        translationToggle.addEventListener('click', () => this.toggleTranslationRenderMode(index));
        
        // 翻译markdown版本
        const translationMarkdown = document.createElement('textarea');
        translationMarkdown.className = 'content-markdown';
        translationMarkdown.value = translationContent ?? '';
        translationMarkdown.setAttribute('oninput', 'this.style.height = "";this.style.height = this.scrollHeight + "px"');
        
        // 初始化高度
        setTimeout(() => {
            translationMarkdown.style.height = '';
            translationMarkdown.style.height = translationMarkdown.scrollHeight + 'px';
        }, 0);
        
        translationMarkdown.addEventListener('input', () => {
            this.translationBlocks[index] = translationMarkdown.value;
            // 同步更新mathjax版本的内容
            translationMathjax.innerHTML = translationMarkdown.value;
            // 重新渲染MathJax版本
            if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
                MathJax.typesetPromise([translationMathjax]).catch((err) => console.log(err.message));
            }
        });
        
        // 翻译mathjax版本
        const translationMathjax = document.createElement('div');
        translationMathjax.className = 'content-mathjax tex2jax_process';
        translationMathjax.innerHTML = translationContent ?? '';
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
        
        const apiKey = document.getElementById('api-key').value;
        const prompt = document.getElementById('translation-prompt').value;
        const provider = document.getElementById('api-provider').value;
        const customEndpoint = document.getElementById('api-endpoint').value;
        const modelName = document.getElementById('model-name').value;
        const contextCountValue = parseInt(document.getElementById('context-count').value);
        const contextCount = isNaN(contextCountValue) ? 1 : contextCountValue;
        const temperatureValue = document.getElementById('temperature').value;
        const enableThinking = document.getElementById('enable-thinking').checked;
        
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
                temperatureValue,
                enableThinking
            );
            
            if (translation) {
                this.translationBlocks[index] = translation;
                
                // 更新翻译块的显示
                const translationBlock = document.querySelector(`[data-index="${index}"] .translation-block`);
                const markdownDiv = translationBlock.querySelector('.content-markdown');
                const mathjaxDiv = translationBlock.querySelector('.content-mathjax');
                
                markdownDiv.value = translation;
                // 触发自动调整高度
                markdownDiv.style.height = '';
                markdownDiv.style.height = markdownDiv.scrollHeight + 'px';
                mathjaxDiv.innerHTML = translation;
                
                // 重新渲染MathJax版本（无论当前显示的是哪个版本）
                if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
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

    async callTranslationAPI(text, prompt, apiKey, provider, customEndpoint, modelName, context = null, abortController = null, blockIndex = null, temperature = null, enableThinking = false) {
        // Assert that prompt contains ORIGTEXT exactly once
        const origTextCount = (prompt.match(/ORIGTEXT/g) || []).length;
        if (origTextCount !== 1) {
            throw new Error(languageManager.get('messages.noOrigTextOnce'));
        }
        
        let fullPrompt = prompt;
        
        // Replace ORIGTEXT with the actual text and context
        fullPrompt = fullPrompt.replace('ORIGTEXT', text);
        
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
                    model: modelName ?? 'gpt-3.5-turbo',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    max_tokens: 2000
                };
                
                // 根据enableThinking状态设置think参数（如果API支持）
                if (enableThinking) {
                    body.think = true;
                }
                
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
                    model: modelName ?? 'claude-3-sonnet-20240229',
                    max_tokens: 2000,
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ]
                };
                
                // 根据enableThinking状态设置think参数（如果API支持）
                if (enableThinking) {
                    body.think = true;
                }
                
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
                    model: modelName ?? 'llama3.2',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    stream: true  // 启用流式输出
                };
                
                // 根据enableThinking状态设置think参数
                if (enableThinking) {
                    body.think = true;
                }
                
                // 只有当temperature有值时才添加到请求中
                if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
                    const tempFloat = parseFloat(temperature);
                    if (!isNaN(tempFloat)) {
                        body.options = body.options ?? {};
                        body.options.temperature = tempFloat;
                    }
                }
                break;
                
            default:
                throw new Error(languageManager.get('errors.unsupportedApiProvider'));
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
        let result = '';
        if (provider === 'openai' || provider === 'custom') {
            result = data.choices[0]?.message?.content ?? languageManager.get('errors.translationFailed');
        } else if (provider === 'anthropic') {
            result = data.content[0]?.text ?? languageManager.get('errors.translationFailed');
        } else if (provider === 'ollama') {
            result = data.message?.content ?? languageManager.get('errors.translationFailed');
        }

        // 提取thinking部分并打印到控制台
        const thinkingMatch = result.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            console.log(languageManager.get('prompts.translationThinking'), thinkingMatch[1].trim());
            // 删除thinking部分
            result = result.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        }

        return result ?? languageManager.get('errors.parseApiResponseFailed')
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
                                markdownDiv.value = result;
                                // 触发自动调整高度
                                markdownDiv.style.height = '';
                                markdownDiv.style.height = markdownDiv.scrollHeight + 'px';
                                this.translationBlocks[blockIndex] = result;
                                
                                // 同步更新mathjax版本
                                if (mathjaxDiv) {
                                    mathjaxDiv.innerHTML = result;
                                    
                                    // 如果当前显示的是MathJax模式，重新渲染
                                    if (this.translationRenderMode[blockIndex] === 'mathjax') {
                                        if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
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
        
        return result ?? languageManager.get('errors.translationFailed');
    }

    switchToProofreadingMode() {
        const translateButtons = document.querySelectorAll('.translate-button');
        translateButtons.forEach((btn, index) => {
            btn.innerHTML = '✓';
            btn.title = languageManager.get('ui.tooltips.proofreadParagraph');
            // 移除旧的事件监听器并添加新的
            const newBtn = btn.cloneNode(true);
            newBtn.addEventListener('click', () => this.proofreadBlock(index));
            btn.parentNode.replaceChild(newBtn, btn);
        });
    }

    switchToTranslationMode() {
        const translateButtons = document.querySelectorAll('.translate-button');
        translateButtons.forEach((btn, index) => {
            btn.innerHTML = '→';
            btn.title = languageManager.get('ui.tooltips.translateParagraph');
            // 移除旧的事件监听器并添加新的
            const newBtn = btn.cloneNode(true);
            newBtn.addEventListener('click', () => this.translateBlock(index));
            btn.parentNode.replaceChild(newBtn, btn);
        });
    }

    async translateAll() {
        // 如果已经在翻译中，点击按钮则停止翻译
        if (this.isTranslatingAll) {
            this.isTranslatingAll = false;
            const translateAllBtn = document.getElementById('translate-all-btn');
            translateAllBtn.disabled = false;
            translateAllBtn.innerHTML = languageManager.get('ui.buttons.translateAll');
            return;
        }

        const apiKey = document.getElementById('api-key').value;
        const provider = document.getElementById('api-provider').value;
        const modelName = document.getElementById('model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError(languageManager.get('errors.apiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            this.showError(languageManager.get('errors.modelNameRequired'));
            return;
        }
        
        this.isTranslatingAll = true;
        const translateAllBtn = document.getElementById('translate-all-btn');
        translateAllBtn.disabled = false; // 保持按钮可点击以便停止
        translateAllBtn.innerHTML = '<span class="loading-spinner"></span>' + languageManager.get('ui.buttons.stopTranslation');
        
        try {
            for (let i = 0; i < this.originalBlocks.length; i++) {
                // 检查是否被用户停止
                if (!this.isTranslatingAll) {
                    break;
                }
                
                if (this.translationBlocks[i].trim().length === 0) { // 只翻译未翻译的块
                    // scroll into view
                    const translationDiv = document.querySelector(`[data-index="${i}"] .translation-block`);
                    translationDiv.scrollIntoViewIfNeeded();
                    await this.translateBlock(i);
                    // 添加延迟以避免API限制
                    if (this.isTranslatingAll) { // 只有在未被停止时才延迟
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
        } catch (error) {
            this.showError(languageManager.get('errors.batchTranslationFailed') + error.message);
        } finally {
            this.isTranslatingAll = false;
            translateAllBtn.disabled = false;
            translateAllBtn.innerHTML = languageManager.get('ui.buttons.translateAll');
        }
    }

    async proofreadBlock(index) {
        await this.proofreadSingleBlock(index);
    }

    async proofreadSingleBlock(index) {
        const translateBtn = document.querySelector(`[data-index="${index}"] .translate-button`);
        const translationContent = this.translationBlocks[index];
        const originalContent = this.originalBlocks[index];

        // 如果已有正在进行的校对，则中断它
        if (this.activeProofreadings.has(index)) {
            this.activeProofreadings.get(index).abort();
            this.activeProofreadings.delete(index);
            translateBtn.innerHTML = '✓';
            translateBtn.title = languageManager.get('ui.tooltips.proofreadParagraph');
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
            return;
        }

        const apiKey = document.getElementById('api-key').value;
        const prompt = document.getElementById('proofread-prompt').value;
        const provider = document.getElementById('proofread-api-provider').value ?? 'ollama';
        const customEndpoint = document.getElementById('proofread-api-endpoint').value;
        const modelName = document.getElementById('proofread-model-name').value;
        const temperatureValue = document.getElementById('proofread-temperature').value;
        const enableProofreadThinking = document.getElementById('proofread-enable-thinking').checked;

        if (!apiKey && provider !== 'ollama') {
            this.showError(languageManager.get('errors.proofreadApiKeyRequired'));
            return;
        }

        if (!modelName) {
            this.showError(languageManager.get('errors.proofreadModelNameRequired'));
            return;
        }

        if (!translationContent || translationContent.trim() === '') {
            this.showError(languageManager.get('errors.translateBeforeProofread'));
            return;
        }

        // 创建AbortController用于中断请求
        const abortController = new AbortController();
        this.activeProofreadings.set(index, abortController);
        
        // 更新按钮为中断状态
        translateBtn.innerHTML = '⏹';
        translateBtn.title = languageManager.get('ui.tooltips.stopProofreading');
        translateBtn.disabled = false;
        translateBtn.classList.add('loading');
        
        try {
            const proofreadResult = await this.callProofreadingAPI(
                originalContent,
                translationContent, 
                prompt, 
                apiKey, 
                provider, 
                customEndpoint, 
                modelName, 
                abortController,
                index,
                temperatureValue,
                enableProofreadThinking
            );
            
            if (proofreadResult) {
                this.translationBlocks[index] = proofreadResult;
                
                // 更新翻译块的显示
                const translationBlock = document.querySelector(`[data-index="${index}"] .translation-block`);
                const markdownDiv = translationBlock.querySelector('.content-markdown');
                const mathjaxDiv = translationBlock.querySelector('.content-mathjax');
                
                markdownDiv.value = proofreadResult;
                // 触发自动调整高度
                markdownDiv.style.height = '';
                markdownDiv.style.height = markdownDiv.scrollHeight + 'px';
                mathjaxDiv.innerHTML = proofreadResult;

                // 重新渲染MathJax版本
                if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
                    MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                }
                
                // 有新校对内容时，重置导出标记
                this.hasExported = false;
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showError(languageManager.get('errors.proofreadingFailed') + error.message);
            }
        } finally {
            // 清理状态
            this.activeProofreadings.delete(index);
            translateBtn.innerHTML = '✓';
            translateBtn.title = languageManager.get('ui.tooltips.proofreadParagraph');
            translateBtn.disabled = false;
            translateBtn.classList.remove('loading');
        }
    }


    async callProofreadingAPI(originalText, translationText, prompt, apiKey, provider, customEndpoint, modelName, abortController = null, blockIndex = null, temperature = null, enableThinking = false) {
        // Replace ORIGTEXT and TRANSTEXT in the prompt if they exist
        let fullPrompt = prompt;
        
        if (fullPrompt.includes('ORIGTEXT')) {
            fullPrompt = fullPrompt.replace(/ORIGTEXT/g, originalText);
        }
        
        if (fullPrompt.includes('TRANSTEXT')) {
            fullPrompt = fullPrompt.replace(/TRANSTEXT/g, translationText);
        } else {
            throw new Error(languageManager.get('messages.noOrigText'));
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
                    throw new Error(languageManager.get('errors.unsupportedProofreadApiProvider'));
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
                    model: modelName ?? 'gpt-4',
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    max_tokens: 4000,
                    stream: true
                };
                
                // 根据enableThinking状态设置think参数（如果API支持）
                if (enableThinking) {
                    body.think = true;
                }
                
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
                    model: modelName ?? 'claude-3-sonnet-20240229',
                    max_tokens: 4000,
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    stream: true
                };
                
                // 根据enableThinking状态设置think参数（如果API支持）
                if (enableThinking) {
                    body.think = true;
                }
                
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
                    model: modelName,
                    messages: [
                        { role: 'user', content: fullPrompt }
                    ],
                    stream: true  // 启用流式输出
                };
                
                // 根据enableThinking状态设置think参数
                if (enableThinking) {
                    body.think = true;
                }
                
                // 只有当temperature有值时才添加到请求中
                if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
                    const tempFloat = parseFloat(temperature);
                    if (!isNaN(tempFloat)) {
                        body.options = body.options ?? {};
                        body.options.temperature = tempFloat;
                    }
                }
                break;
                
            default:
                throw new Error(languageManager.get('errors.unsupportedProofreadApiProvider'));
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
            throw new Error(`校对API请求失败: ${response.status} - ${error}`);
        }
        
        // 处理流式响应
        if (body.stream) {
            return await this.handleProofreadingStreamResponse(response, blockIndex, provider);
        }
        
        // 处理非流式响应（备用）
        const data = await response.json();
        
        // 根据提供商类型解析响应
        let result = '';
        if (provider === 'openai' || provider === 'custom') {
            result = data.choices[0]?.message?.content ?? languageManager.get('errors.proofreadFailed');
        } else if (provider === 'anthropic') {
            result = data.content[0]?.text ?? languageManager.get('errors.proofreadFailed');
        } else if (provider === 'ollama') {
            result = data.message?.content ?? languageManager.get('errors.proofreadFailed');
        }
        
        // 提取thinking部分并打印到控制台
        const thinkingMatch = result.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            console.log(languageManager.get('prompts.proofreadingThinking'), thinkingMatch[1].trim());
            // 删除thinking部分
            result = result.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        }
        
        return result ?? languageManager.get('errors.proofreadFailed');
    }

    async handleProofreadingStreamResponse(response, blockIndex, provider) {
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
                
                if (provider === 'ollama') {
                    // 处理Ollama流式响应
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        
                        try {
                            const data = JSON.parse(line);

                            if (data.message && data.message.thinking) {
                                console.log(data.message.thinking)
                            }
                            
                            if (data.message && data.message.content) {
                                result += data.message.content;
                                
                                // 实时更新界面显示（但不包含thinking部分）
                                let displayResult = result;
                                // const thinkingMatch = displayResult.match(/<think>[\s\S]*?<\/think>\s*/);
                                // if (thinkingMatch) {
                                //     displayResult = displayResult.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
                                // }
                                
                                if (markdownDiv && blockIndex !== null && displayResult) {
                                    markdownDiv.value = displayResult;
                                    // 触发自动调整高度
                                    markdownDiv.style.height = '';
                                    markdownDiv.style.height = markdownDiv.scrollHeight + 'px';
                                    this.translationBlocks[blockIndex] = displayResult;
                                    
                                    // 同步更新mathjax版本
                                    if (mathjaxDiv) {
                                        mathjaxDiv.innerHTML = displayResult;
                                        
                                        // 如果当前显示的是MathJax模式，重新渲染
                                        if (this.translationRenderMode && this.translationRenderMode[blockIndex] === 'mathjax') {
                                            if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
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
                } else {
                    // 处理OpenAI/Anthropic流式响应
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.trim() === '' || !line.startsWith('data: ')) continue;
                        
                        const data = line.substring(6); // 移除 'data: ' 前缀
                        
                        if (data === '[DONE]') break;
                        
                        try {
                            const parsed = JSON.parse(data);
                            let content = '';
                            
                            if (provider === 'openai' || provider === 'custom') {
                                content = parsed.choices?.[0]?.delta?.content ?? '';
                            } else if (provider === 'anthropic') {
                                content = parsed.delta?.text ?? '';
                            }
                            
                            if (content) {
                                result += content;
                                
                                // 实时更新界面显示（但不包含thinking部分）
                                let displayResult = result;
                                const thinkingMatch = displayResult.match(/<think>[\s\S]*?<\/think>\s*/);
                                if (thinkingMatch) {
                                    displayResult = displayResult.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
                                }
                                
                                if (markdownDiv && blockIndex !== null && displayResult) {
                                    markdownDiv.value = displayResult;
                                    // 触发自动调整高度
                                    markdownDiv.style.height = '';
                                    markdownDiv.style.height = markdownDiv.scrollHeight + 'px';
                                    this.translationBlocks[blockIndex] = displayResult;
                                    
                                    // 同步更新mathjax版本
                                    if (mathjaxDiv) {
                                        mathjaxDiv.innerHTML = displayResult;
                                        
                                        // 如果当前显示的是MathJax模式，重新渲染
                                        if (this.translationRenderMode && this.translationRenderMode[blockIndex] === 'mathjax') {
                                            if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
                                                MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // 忽略JSON解析错误，继续处理下一行
                            continue;
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        // 提取thinking部分并打印到控制台
        const thinkingMatch = result.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            console.log(languageManager.get('prompts.proofreadingThinking'), thinkingMatch[1].trim());
            // 删除thinking部分
            result = result.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        }
        
        return result ?? languageManager.get('errors.proofreadFailed');
    }

    async proofreadAll() {
        const apiKey = document.getElementById('proofread-api-key').value;
        const provider = document.getElementById('proofread-api-provider').value ?? 'ollama';
        const modelName = document.getElementById('proofread-model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            this.showError(languageManager.get('errors.proofreadApiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            this.showError(languageManager.get('errors.proofreadModelNameRequired'));
            return;
        }
        
        const proofreadAllBtn = document.getElementById('proofread-all-btn');
        proofreadAllBtn.disabled = true;
        proofreadAllBtn.innerHTML = '<span class="loading-spinner"></span>' + languageManager.get('messages.proofreading');
        
        try {
            for (let i = 0; i < this.originalBlocks.length; i++) {
                if (this.translationBlocks[i] && this.translationBlocks[i].trim()) {
                    await this.proofreadSingleBlock(i);
                    // 添加延迟以避免API限制
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.showError(languageManager.get('errors.batchProofreadingFailed') + error.message);
        } finally {
            proofreadAllBtn.disabled = false;
            proofreadAllBtn.innerHTML = languageManager.get('ui.buttons.proofreadAll');
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

    saveProgress() {
        if (!this.currentFile || this.originalBlocks.length === 0) {
            this.showError(languageManager.get('errors.noProgressToSave'));
            return;
        }
        
        const progressData = [];
        
        for (let i = 0; i < this.originalBlocks.length; i++) {
            progressData.push({
                original_text: this.originalBlocks[i],
                translated_text: this.translationBlocks[i] ?? ''
            });
        }
        
        const blob = new Blob([JSON.stringify(progressData, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name.replace(/\.(md|markdown)$/, '_progress.json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleProgressUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.json')) {
            this.showError(languageManager.get('errors.loadProgressInvalidFormat'));
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const progressData = JSON.parse(e.target.result);
                
                if (!Array.isArray(progressData)) {
                    this.showError(languageManager.get('errors.loadProgressInvalidData'));
                    return;
                }
                
                // 验证数据格式
                for (let i = 0; i < progressData.length; i++) {
                    const item = progressData[i];
                    if (!item.hasOwnProperty('original_text') || !item.hasOwnProperty('translated_text')) {
                        this.showError(languageManager.get('errors.loadProgressInvalidObject', {index: i+1}));
                        return;
                    }
                }
                
                // 加载数据到数组中
                this.originalBlocks = progressData.map(item => item.original_text);
                this.translationBlocks = progressData.map(item => item.translated_text);
                
                // 初始化渲染模式数组
                this.originalRenderMode = new Array(this.originalBlocks.length).fill('mathjax');
                this.translationRenderMode = new Array(this.originalBlocks.length).fill('markdown');
                
                // 重置导出标记
                this.hasExported = false;
                
                // 创建一个虚拟文件对象
                this.currentFile = {
                    name: 'loaded_progress.md'
                };
                
                // 重新渲染页面
                this.renderBlocks();
                this.updateFileInfo();
                
                // 启用相关按钮
                document.getElementById('translate-all-btn').disabled = false;
                document.getElementById('export-btn').disabled = false;
                document.getElementById('export-alternating-btn').disabled = false;
                document.getElementById('save-progress-btn').disabled = false;
                document.getElementById('export-original-btn').disabled = false;
                document.getElementById('reorganize-paragraphs-btn').disabled = false;
                
                // 如果处于校对模式，启用校对所有按钮
                if (this.proofreadingMode) {
                    document.getElementById('proofread-all-btn').disabled = false;
                }
                
            } catch (error) {
                this.showError(languageManager.get('errors.loadProgressFailed') + error.message);
            }
        };
        
        reader.onerror = () => {
            this.showError(languageManager.get('errors.loadProgressReadFailed'));
        };
        
        reader.readAsText(file, 'UTF-8');
        
        // 清空文件输入，以便可以重复选择同一文件
        event.target.value = '';
    }

    exportOriginal() {
        if (!this.currentFile || this.originalBlocks.length === 0) {
            this.showError(languageManager.get('errors.noOriginalContent'));
            return;
        }
        
        const originalContent = this.originalBlocks.join('\n\n');
        
        const blob = new Blob([originalContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name.startsWith('original_') 
            ? this.currentFile.name 
            : `original_${this.currentFile.name}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportAlternatingTranslation() {
        if (!this.currentFile || this.originalBlocks.length === 0) {
            this.showError(languageManager.get('errors.noTranslationContent'));
            return;
        }
        
        // 构建交替内容：原文（英文）在前，翻译（中文）在后
        const alternatingContent = [];
        
        for (let i = 0; i < this.originalBlocks.length; i++) {
            const originalBlock = this.originalBlocks[i];
            const translationBlock = this.translationBlocks[i];
            
            if (originalBlock && originalBlock.trim()) {
                // 添加原文（英文）
                alternatingContent.push(originalBlock.trim());
                
                // 添加翻译（中文），如果有翻译内容且不同于原文
                if (translationBlock && translationBlock.trim() && translationBlock.trim() !== originalBlock.trim()) {
                    alternatingContent.push(translationBlock.trim());
                }
            }
        }
            
        if (alternatingContent.length === 0) {
            this.showError(languageManager.get('errors.noTranslatedContent'));
            return;
        }
        
        const finalContent = alternatingContent.join('\n\n');
        const blob = new Blob([finalContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name.startsWith('alternating_') 
            ? this.currentFile.name 
            : `alternating_${this.currentFile.name}`;
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
            const original = this.originalBlocks[index];
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
            const markdownTextarea = container.querySelector('.content-markdown');
            const mathjaxDiv = container.querySelector('.content-mathjax');
            const mode = this.originalRenderMode[index];
            
            if (mode === 'markdown') {
                toggle.innerHTML = '📝';
                toggle.title = languageManager.get('ui.tooltips.toggleToMathJax');
                markdownTextarea.style.display = 'block';
                mathjaxDiv.style.display = 'none';
                // 调整高度
                markdownTextarea.style.height = '';
                markdownTextarea.style.height = markdownTextarea.scrollHeight + 'px';
            } else {
                toggle.innerHTML = '∫';
                toggle.title = languageManager.get('ui.tooltips.toggleToMarkdown');
                markdownTextarea.style.display = 'none';
                mathjaxDiv.style.display = 'block';
                // 触发MathJax渲染
                if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
                    MathJax.typesetPromise([mathjaxDiv]).catch((err) => console.log(err.message));
                }
            }
        } else {
            const container = pair.querySelector('.translation-block');
            const toggle = container.querySelector('.render-toggle');
            const markdownTextarea = container.querySelector('.content-markdown');
            const mathjaxDiv = container.querySelector('.content-mathjax');
            const mode = this.translationRenderMode[index];
            
            if (mode === 'markdown') {
                toggle.innerHTML = '📝';
                toggle.title = languageManager.get('ui.tooltips.toggleToMathJax');
                markdownTextarea.style.display = 'block';
                mathjaxDiv.style.display = 'none';
                // 调整高度
                markdownTextarea.style.height = '';
                markdownTextarea.style.height = markdownTextarea.scrollHeight + 'px';
            } else {
                toggle.innerHTML = '∫';
                toggle.title = languageManager.get('ui.tooltips.toggleToMarkdown');
                markdownTextarea.style.display = 'none';
                mathjaxDiv.style.display = 'block';
                // 触发MathJax渲染
                if (typeof MathJax !== 'undefined' && typeof MathJax.typesetPromise !== 'undefined') {
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
        
        // 重新加载当前语言的设置
        this.loadSettings();
    }

    reorganizeParagraphs() {
        if (!this.originalBlocks || this.originalBlocks.length === 0) {
            this.showError(languageManager.get('errors.noParagraphsToReorganize'));
            return;
        }

        const charLimit = parseInt(document.getElementById('paragraph-char-limit').value);
        
        if (charLimit <= 0) {
            this.showError(languageManager.get('errors.invalidCharacterLimit'));
            return;
        }

        // 重新组织原文和译文段落 - 同时处理两个数组
        const result = this.mergeParagraphs(this.originalBlocks, this.translationBlocks, charLimit);

        // 更新数组
        this.originalBlocks = result.originalBlocks;
        this.translationBlocks = result.translationBlocks;
        
        // 重新初始化渲染模式数组
        this.originalRenderMode = new Array(this.originalBlocks.length).fill('mathjax');
        this.translationRenderMode = new Array(this.originalBlocks.length).fill('markdown');
        
        // 重新渲染
        this.renderBlocks();
        this.updateFileInfo();
        
        // 重置导出标记
        this.hasExported = false;
    }

    mergeParagraphs(originalBlocks, translationBlocks, charLimit) {
        const mergedOriginalBlocks = [];
        const mergedTranslationBlocks = [];
        let currentOriginalMerged = [];
        let currentTranslationMerged = [];
        let currentCharCount = 0;

        for (let i = 0; i < originalBlocks.length; i++) {
            const originalBlock = originalBlocks[i] ?? '';
            const translationBlock = translationBlocks[i] ?? '';
            const blockLength = originalBlock.length;
            
            // 如果是第一个段落，或者加入当前段落后不超过字符限制，就加入当前合并组
            if (currentOriginalMerged.length === 0 || currentCharCount + blockLength + 4 <= charLimit) { // +4 for \n\n separator
                currentOriginalMerged.push(originalBlock);
                currentTranslationMerged.push(translationBlock);
                currentCharCount += blockLength + (currentOriginalMerged.length > 1 ? 2 : 0); // +2 for \n\n
            } else {
                // 超过限制，保存当前合并组并开始新的合并组
                if (currentOriginalMerged.length > 0) {
                    mergedOriginalBlocks.push(currentOriginalMerged.join('\n\n'));
                    mergedTranslationBlocks.push(currentTranslationMerged.join('\n\n'));
                }
                currentOriginalMerged = [originalBlock];
                currentTranslationMerged = [translationBlock];
                currentCharCount = blockLength;
            }
        }

        // 处理最后一个合并组
        if (currentOriginalMerged.length > 0) {
            mergedOriginalBlocks.push(currentOriginalMerged.join('\n\n'));
            mergedTranslationBlocks.push(currentTranslationMerged.join('\n\n'));
        }

        return {
            originalBlocks: mergedOriginalBlocks,
            translationBlocks: mergedTranslationBlocks
        };
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    new MarkdownTranslator();
});