class MarkdownTranslator {
    constructor() {
        this.originalBlocks = [];
        this.translationBlocks = [];
        this.currentFile = null;
        this.isResizing = false;
        this.sidebarCollapsed = false;
        this.hasExported = false; // 标记是否已导出
        this.activeTranslations = new Map(); // 存储正在进行的翻译请求的AbortController
        this.activeProofreadings = new Map(); // 存储正在进行的校对请求的AbortController
        this.originalEditors = [];    // TipTap 编辑器实例
        this.translationEditors = []; // TipTap 编辑器实例
        this.proofreadingMode = false; // 校对模式标志
        this.isTranslatingAll = false; // 跟踪是否正在进行全部翻译
        this.init();
    }

    async init() {
        // 等待语言管理器初始化完成
        if (!languageManager.isInitialized()) {
            await languageManager.init();
        }

        // 等待 TipTap 编辑器加载完成
        if (!window.tiptapReady) {
            await new Promise(resolve => window.addEventListener('tiptap-ready', resolve, { once: true }));
        }

        this.setupEventListeners();
        this.loadSettings();
        this.setupSidebar();
        this.setupBeforeUnloadWarning();
        this.initLanguageSettings();
        this.loadAutoSavedProgress();
    }

    setupEventListeners() {
        // 文件上传
        const uploadBtn = document.getElementById('translation-upload-btn');
        const fileInput = document.getElementById('translation-file-input');
        
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // 导出功能
        document.getElementById('translation-export-btn').addEventListener('click', () => this.exportTranslation());

        // 保存进度
        document.getElementById('translation-save-progress-btn').addEventListener('click', () => this.saveProgress());

        // 加载进度
        const loadProgressBtn = document.getElementById('translation-load-progress-btn');
        const progressInput = document.getElementById('translation-progress-input');
        
        loadProgressBtn.addEventListener('click', () => progressInput.click());
        progressInput.addEventListener('change', (e) => this.handleProgressUpload(e));

        // 导出原文
        document.getElementById('translation-export-original-btn').addEventListener('click', () => this.exportOriginal());
        
        // 导出交替翻译结果
        document.getElementById('translation-export-alternating-btn').addEventListener('click', () => this.exportAlternatingTranslation());

        // 全部翻译
        document.getElementById('translate-all-btn').addEventListener('click', () => this.translateAll());

        // 校对功能
        document.getElementById('proofreading-mode').addEventListener('change', (e) => this.onProofreadingModeChange(e));
        document.getElementById('proofread-all-btn').addEventListener('click', () => this.proofreadAll());

        // 段落重新划分功能
        document.getElementById('translation-reorganize-paragraphs-btn').addEventListener('click', () => this.reorganizeParagraphs());
        document.getElementById('translation-paragraph-char-limit').addEventListener('input', () => this.saveSettings());

        // 设置变更
        document.getElementById('translation-prompt').addEventListener('input', () => this.saveSettings());
        document.getElementById('translation-api-key').addEventListener('input', () => this.saveSettings());
        document.getElementById('translation-api-endpoint').addEventListener('input', () => this.saveSettings());
        document.getElementById('translation-model-name').addEventListener('input', () => this.saveSettings());
        document.getElementById('translation-api-provider').addEventListener('change', () => this.onProviderChange());
        document.getElementById('interface-language').addEventListener('change', (e) => this.onLanguageChange(e));
        
        // 上下文数量控制
        document.getElementById('translation-context-count').addEventListener('input', () => this.saveSettings());
        
        // temperature控制
        document.getElementById('translation-temperature').addEventListener('input', () => this.saveSettings());
        
        // thinking控制
        document.getElementById('translation-enable-thinking').addEventListener('change', () => this.saveSettings());

        // 翻译延迟控制
        document.getElementById('translation-delay').addEventListener('input', () => this.saveSettings());
        
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
        document.getElementById('translation-collapse-btn').addEventListener('click', () => this.toggleSidebar());
    }


    loadSettings() {
        const currentLanguage = languageManager.getCurrentLanguage();
        const settings = this.getStoredSettings(currentLanguage);
        
        if (settings) {
            // 加载翻译设置
            this.loadTranslationSettings(settings);
            
            // 加载校对设置
            this.loadProofreadSettings(settings);
            
            // 加载通用设置
            this.loadGeneralSettings(settings);
        } else {
            // 初次使用时设置默认值
            this.loadDefaultSettings();
        }
    }

    getStoredSettings(language) {
        const settingsKey = `markdown-translator-settings-${language}`;
        const stored = localStorage.getItem(settingsKey);
        return stored ? JSON.parse(stored) : null;
    }

    loadTranslationSettings(settings) {
        this.loadProviderSettings('translation', settings);
    }

    loadProofreadSettings(settings) {
        this.loadProviderSettings('proofread', settings);
        
        // 设置校对模式
        this.proofreadingMode = settings.proofreadingMode ?? false;
        document.getElementById('proofreading-mode').checked = this.proofreadingMode;
        this.onProofreadingModeChange({ target: { checked: this.proofreadingMode } });
    }

    loadProviderSettings(type, settings) {
        const prefix = type === 'translation' ? 'translation' : 'proofread';
        const providerKey = type === 'translation' ? 'apiProvider' : 'proofreadApiProvider';
        const promptKey = type === 'translation' ? 'prompt' : 'proofreadPrompt';
        
        const provider = settings[providerKey] ?? 'ollama';
        document.getElementById(`${prefix}-api-provider`).value = provider;
        
        // 设置提示词
        if (type === 'translation') {
            document.getElementById(`${prefix}-prompt`).value = settings[promptKey] ?? languageManager.get('ui.settingsPanel.translationPromptDefault');
        } else if (settings[promptKey]) {
            document.getElementById(`${prefix}-prompt`).value = settings[promptKey];
        }
        
        // 加载该provider的设置
        const providerSettings = this.getProviderSettings(type, provider);
        this.applyProviderSettings(type, providerSettings);
    }

    loadGeneralSettings(settings) {
        document.getElementById('translation-context-count').value = (isNaN(settings.contextCount) ? 1 : settings.contextCount);
        document.getElementById('translation-paragraph-char-limit').value = settings.paragraphCharLimit ?? 0;
        document.getElementById('translation-delay').value = settings.translationDelay ?? 0;
        this.sidebarCollapsed = settings.sidebarCollapsed ?? false;
    }

    getProviderSettings(type, provider) {
        return {
            apiKey: this.getProviderSpecificSetting(type, provider, 'ApiKey', ''),
            endpoint: this.getStoredValue(type, provider, 'endpoints'),
            modelName: this.getStoredValue(type, provider, 'models'),
            temperature: this.getProviderSpecificSetting(type, provider, 'Temperature'),
            enableThinking: this.getProviderSpecificSetting(type, provider, 'EnableThinking', false)
        };
    }

    applyProviderSettings(type, settings) {
        const prefix = type === 'translation' ? 'translation' : 'proofread';
        
        document.getElementById(`${prefix}-api-key`).value = settings.apiKey;
        document.getElementById(`${prefix}-api-endpoint`).value = settings.endpoint;
        document.getElementById(`${prefix}-model-name`).value = settings.modelName;
        document.getElementById(`${prefix}-enable-thinking`).checked = settings.enableThinking;
        
        if (settings.temperature !== undefined && settings.temperature !== null && settings.temperature !== '') {
            document.getElementById(`${prefix}-temperature`).value = settings.temperature;
        } else {
            document.getElementById(`${prefix}-temperature`).value = '';
        }
    }

    loadDefaultSettings() {
        this.loadDefaultProviderSettings('translation', 'openai');
        this.loadDefaultProviderSettings('proofread', 'openai');
        document.getElementById('translation-prompt').value = languageManager.get('ui.settingsPanel.translationPromptDefault');
    }

    loadDefaultProviderSettings(type, provider) {
        if (type === 'translation') {
            this.loadApiEndpoint(provider);
            this.loadModelName(provider);
        } else {
            this.loadProofreadApiEndpoint(provider);
            this.loadProofreadModelName(provider);
        }
    }

    saveSettings() {
        const currentLanguage = languageManager.getCurrentLanguage();
        
        // 获取翻译设置
        const translationSettings = this.collectTranslationSettings();
        
        // 获取校对设置
        const proofreadSettings = this.collectProofreadSettings();
        
        // 获取通用设置
        const generalSettings = this.collectGeneralSettings();
        
        // 合并所有设置
        const settings = {
            ...generalSettings,
            ...translationSettings,
            ...proofreadSettings
        };
        
        // 保存provider特定的设置
        this.saveProviderSettings('translation', translationSettings.apiProvider);
        this.saveProviderSettings('proofread', proofreadSettings.proofreadApiProvider);
        
        // 保存到localStorage
        const settingsKey = `markdown-translator-settings-${currentLanguage}`;
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }

    collectTranslationSettings() {
        const provider = document.getElementById('translation-api-provider').value;
        const temperatureValue = document.getElementById('translation-temperature').value;
        
        const settings = {
            prompt: document.getElementById('translation-prompt').value,
            apiProvider: provider,
            enableThinking: document.getElementById('translation-enable-thinking').checked
        };
        
        if (temperatureValue && temperatureValue.trim() !== '') {
            const tempFloat = parseFloat(temperatureValue);
            if (!isNaN(tempFloat)) {
                settings.temperature = tempFloat;
            }
        }
        
        return settings;
    }

    collectProofreadSettings() {
        const provider = document.getElementById('proofread-api-provider').value;
        const temperatureValue = document.getElementById('proofread-temperature').value;
        
        const settings = {
            proofreadingMode: this.proofreadingMode,
            proofreadPrompt: document.getElementById('proofread-prompt').value,
            proofreadApiProvider: provider,
            proofreadEnableThinking: document.getElementById('proofread-enable-thinking').checked
        };
        
        if (temperatureValue && temperatureValue.trim() !== '') {
            const tempFloat = parseFloat(temperatureValue);
            if (!isNaN(tempFloat)) {
                settings.proofreadTemperature = tempFloat;
            }
        }
        
        return settings;
    }

    collectGeneralSettings() {
        const contextCountValue = parseInt(document.getElementById('translation-context-count').value);
        const paragraphCharLimitValue = parseInt(document.getElementById('translation-paragraph-char-limit').value);
        const translationDelayValue = parseInt(document.getElementById('translation-delay').value);

        return {
            contextCount: isNaN(contextCountValue) ? 1 : contextCountValue,
            paragraphCharLimit: isNaN(paragraphCharLimitValue) ? 0 : paragraphCharLimitValue,
            translationDelay: isNaN(translationDelayValue) ? 0 : translationDelayValue,
            sidebarCollapsed: this.sidebarCollapsed
        };
    }

    saveProviderSettings(type, provider) {
        const prefix = type === 'translation' ? 'translation' : 'proofread';
        const endpoint = document.getElementById(`${prefix}-api-endpoint`).value;
        const modelName = document.getElementById(`${prefix}-model-name`).value;
        const enableThinking = document.getElementById(`${prefix}-enable-thinking`).checked;
        const temperatureValue = document.getElementById(`${prefix}-temperature`).value;
        const apiKey = document.getElementById(`${prefix}-api-key`).value;
        
        // 保存 endpoint 和 modelName (原有逻辑)
        if (type === 'translation') {
            this.saveApiEndpoint(provider, endpoint);
            this.saveModelName(provider, modelName);
        } else {
            this.saveProofreadApiEndpoint(provider, endpoint);
            this.saveProofreadModelName(provider, modelName);
        }
        
        // 保存 API Key 按provider分开
        this.saveProviderSpecificSetting(type, provider, 'ApiKey', apiKey);
        
        // 保存 enableThinking 和 temperature 设置
        this.saveProviderSpecificSetting(type, provider, 'EnableThinking', enableThinking);
        
        if (temperatureValue && temperatureValue.trim() !== '') {
            const tempFloat = parseFloat(temperatureValue);
            if (!isNaN(tempFloat)) {
                this.saveProviderSpecificSetting(type, provider, 'Temperature', tempFloat);
            }
        }
    }

    saveProviderSpecificSetting(type, provider, settingName, value) {
        const storageKey = type === 'translation' ? 
            `markdown-translator-${settingName.toLowerCase()}` : 
            `markdown-translator-proofread-${settingName.toLowerCase()}`;
        
        const stored = localStorage.getItem(storageKey);
        const settings = stored ? JSON.parse(stored) : {};
        settings[provider] = value;
        localStorage.setItem(storageKey, JSON.stringify(settings));
    }

    getProviderSpecificSetting(type, provider, settingName, defaultValue = null) {
        const storageKey = type === 'translation' ? 
            `markdown-translator-${settingName.toLowerCase()}` : 
            `markdown-translator-proofread-${settingName.toLowerCase()}`;
        
        const stored = localStorage.getItem(storageKey);
        const settings = stored ? JSON.parse(stored) : {};
        return settings[provider] ?? defaultValue;
    }

    onProviderChange() {
        this.handleProviderChange('translation');
    }

    onProofreadProviderChange() {
        this.handleProviderChange('proofread');
    }

    handleProviderChange(type) {
        const prefix = type === 'translation' ? 'translation' : 'proofread';
        const provider = document.getElementById(`${prefix}-api-provider`).value;
        
        // 加载endpoint和model
        if (type === 'translation') {
            this.loadApiEndpoint(provider);
            this.loadModelName(provider);
        } else {
            this.loadProofreadApiEndpoint(provider);
            this.loadProofreadModelName(provider);
        }
        
        // 加载provider特定设置
        const providerSettings = this.getProviderSettings(type, provider);
        this.applyProviderSettings(type, providerSettings);
        
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

    getDefaultEndpoints() {
        return {
            'openai': 'https://api.openai.com/v1/chat/completions',
            'anthropic': 'https://api.anthropic.com/v1/messages',
            'ollama': '//localhost:11434/api/chat',
            'custom': ''
        };
    }

    getDefaultModels(type = 'translation') {
        const translationModels = {
            'openai': 'gpt-3.5-turbo',
            'anthropic': 'claude-3-sonnet-20240229',
            'ollama': 'llama2',
            'custom': ''
        };
        
        const proofreadModels = {
            'openai': 'gpt-4',
            'anthropic': 'claude-3-sonnet-20240229',
            'ollama': 'llama2',
            'custom': ''
        };
        
        return type === 'translation' ? translationModels : proofreadModels;
    }

    loadApiSettings(type, provider, settingType) {
        const value = this.getStoredValue(type, provider, settingType);
        const elementId = type === 'translation' ? 
            `translation-${settingType === 'endpoints' ? 'api-endpoint' : 'model-name'}` :
            `proofread-${settingType === 'endpoints' ? 'api-endpoint' : 'model-name'}`;
        document.getElementById(elementId).value = value;
    }

    saveApiSettings(type, provider, settingType, value) {
        this.saveProviderSpecificSetting(type, provider, settingType, value);
    }

    getStoredValue(type, provider, settingType) {
        const defaultValues = settingType === 'endpoints' ? this.getDefaultEndpoints() : this.getDefaultModels(type);
        return this.getProviderSpecificSetting(type, provider, settingType, defaultValues[provider] ?? '');
    }

    loadApiEndpoint(provider) {
        this.loadApiSettings('translation', provider, 'endpoints');
    }

    saveApiEndpoint(provider, endpoint) {
        this.saveApiSettings('translation', provider, 'endpoints', endpoint);
    }

    loadModelName(provider) {
        this.loadApiSettings('translation', provider, 'models');
    }

    saveModelName(provider, modelName) {
        this.saveApiSettings('translation', provider, 'models', modelName);
    }

    loadProofreadApiEndpoint(provider) {
        this.loadApiSettings('proofread', provider, 'endpoints');
    }

    saveProofreadApiEndpoint(provider, endpoint) {
        this.saveApiSettings('proofread', provider, 'endpoints', endpoint);
    }

    loadProofreadModelName(provider) {
        this.loadApiSettings('proofread', provider, 'models');
    }

    saveProofreadModelName(provider, modelName) {
        this.saveApiSettings('proofread', provider, 'models', modelName);
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
            showError(languageManager.get('errors.invalidFileType'));
            return;
        }

        this.currentFile = file;
        // 重置导出标记
        this.hasExported = false;
        // 清除之前的自动保存进度，因为要开始新的文件
        this.clearAutoSavedProgress();
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                this.parseContent(e.target.result);
                this.updateFileInfo();
                this.enableProgressButtons();
                
                // 文件加载完成后自动保存进度
                this.autoSaveProgress();
            } catch (error) {
                showError(languageManager.get('errors.parseMarkdownFailed') + error.message);
            }
        };
        
        reader.onerror = () => {
            showError(languageManager.get('errors.readFileFailed'));
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

        this.renderBlocks();
    }

    renderBlocks() {
        const contentContainer = document.getElementById('translation-content-container');

        // 销毁已有的 TipTap 编辑器实例
        this.originalEditors.forEach(e => e?.destroy());
        this.translationEditors.forEach(e => e?.destroy());
        this.originalEditors = [];
        this.translationEditors = [];

        contentContainer.innerHTML = '';
        
        this.originalBlocks.forEach((block, index) => {
            const pairDiv = this.createTextBlockPair(block, this.translationBlocks[index], index);
            contentContainer.appendChild(pairDiv);
        });
    }

    createTextBlockPair(originalContent, translationContent, index) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'text-block-pair';
        pairDiv.dataset.index = index;

        // 原文块容器
        const originalContainer = document.createElement('div');
        originalContainer.className = 'original-block';

        // 原文 TipTap 编辑器容器
        const originalEditorContainer = document.createElement('div');
        originalEditorContainer.className = 'editor-container';

        const originalEditor = window.createTipTapEditor(originalEditorContainer, originalContent, (text) => {
            this.originalBlocks[index] = text;
            this.autoSaveProgress();
        });
        this.originalEditors[index] = originalEditor;

        originalContainer.appendChild(originalEditorContainer);

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

        // 翻译 TipTap 编辑器容器
        const translationEditorContainer = document.createElement('div');
        translationEditorContainer.className = 'editor-container';

        const translationEditor = window.createTipTapEditor(translationEditorContainer, translationContent, (text) => {
            this.translationBlocks[index] = text;
            this.autoSaveProgress();
        });
        this.translationEditors[index] = translationEditor;

        translationContainer.appendChild(translationEditorContainer);

        pairDiv.appendChild(originalContainer);
        pairDiv.appendChild(translateBtn);
        pairDiv.appendChild(translationContainer);

        return pairDiv;
    }

    updateFileInfo() {
        const fileInfo = document.getElementById('translation-file-info');
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
            return;
        }
        
        const apiKey = document.getElementById('translation-api-key').value;
        const prompt = document.getElementById('translation-prompt').value;
        const provider = document.getElementById('translation-api-provider').value;
        const customEndpoint = document.getElementById('translation-api-endpoint').value;
        const modelName = document.getElementById('translation-model-name').value;
        const contextCountValue = parseInt(document.getElementById('translation-context-count').value);
        const contextCount = isNaN(contextCountValue) ? 1 : contextCountValue;
        const temperatureValue = document.getElementById('translation-temperature').value;
        const enableThinking = document.getElementById('translation-enable-thinking').checked;
        
        if (!apiKey && provider !== 'ollama') {
            showError(languageManager.get('errors.apiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            showError(languageManager.get('errors.modelNameRequired'));
            return;
        }
        
        // 创建AbortController用于中断请求
        const abortController = new AbortController();
        this.activeTranslations.set(index, abortController);
        
        // 更新按钮为中断状态
        translateBtn.innerHTML = '⏹';
        translateBtn.title = languageManager.get('ui.buttons.stopTranslation');
        translateBtn.disabled = false;
        
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
                const editor = this.translationEditors[index];
                if (editor) {
                    editor.commands.setContent(window.tiptapTextToHtml(translation), false);
                }

                // 有新翻译内容时，重置导出标记
                this.hasExported = false;

                // 自动保存翻译进度
                this.autoSaveProgress();
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                showError(languageManager.get('errors.translationFailed') + error.message);
            }
        } finally {
            // 清理状态
            this.activeTranslations.delete(index);
            translateBtn.innerHTML = '→';
            translateBtn.title = languageManager.get('ui.buttons.translate');
            translateBtn.disabled = false;
        }
    }

    // 通用API调用方法
    async callLLMAPI(text, prompt, apiKey, provider, customEndpoint, modelName, context = null, abortController = null, blockIndex = null, temperature = null, enableThinking = false, apiType = 'translation') {
        // 验证prompt格式
        if (apiType === 'translation') {
            const origTextCount = (prompt.match(/ORIGTEXT/g) || []).length;
            if (origTextCount !== 1) {
                throw new Error(languageManager.get('messages.noOrigTextOnce'));
            }
            prompt = prompt.replace('ORIGTEXT', text);
        } else if (apiType === 'proofreading') {
            if (prompt.includes('ORIGTEXT')) {
                prompt = prompt.replace(/ORIGTEXT/g, text);
            }
            if (prompt.includes('TRANSTEXT')) {
                prompt = prompt.replace(/TRANSTEXT/g, context);
            } else {
                throw new Error(languageManager.get('messages.noOrigText'));
            }
        }
        
        const { apiUrl, headers, body } = this.buildAPIRequest(provider, customEndpoint, apiKey, modelName, prompt, temperature, enableThinking, apiType);
        
        const fetchOptions = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        };
        
        if (abortController) {
            fetchOptions.signal = abortController.signal;
        }
        
        const response = await fetch(apiUrl, fetchOptions);
        
        if (!response.ok) {
            const error = await response.text();
            const errorKey = apiType === 'translation' ? 'errors.apiRequestFailed' : 'errors.proofreadApiRequestFailed';
            throw new Error(`${languageManager.get(errorKey)}: ${response.status} - ${error}`);
        }
        
        // 处理流式响应
        if (body.stream) {
            return await this.handleStreamResponse(response, blockIndex, provider, apiType);
        }
        
        // 处理非流式响应
        return await this.handleNonStreamResponse(response, provider, apiType);
    }

    // 构建API请求配置
    buildAPIRequest(provider, customEndpoint, apiKey, modelName, prompt, temperature, enableThinking, apiType) {
        let apiUrl;
        
        if (customEndpoint && customEndpoint.trim()) {
            apiUrl = customEndpoint.trim();
        } else {
            const endpoints = {
                'openai': 'https://api.openai.com/v1/chat/completions',
                'anthropic': 'https://api.anthropic.com/v1/messages',
                'ollama': '//localhost:11434/api/chat'
            };
            apiUrl = endpoints[provider];
            if (!apiUrl) {
                const errorKey = apiType === 'translation' ? 'errors.unsupportedApiProvider' : 'errors.unsupportedProofreadApiProvider';
                throw new Error(languageManager.get(errorKey));
            }
        }
        
        let headers, body;
        const maxTokens = apiType === 'translation' ? 2000 : 4000;
        const defaultModels = {
            'openai': apiType === 'translation' ? 'gpt-3.5-turbo' : 'gpt-4',
            'anthropic': 'claude-3-sonnet-20240229',
            'ollama': 'llama3.2'
        };
        
        switch (provider) {
            case 'openai':
            case 'custom':
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                };
                body = {
                    model: modelName ?? defaultModels.openai,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens,
                    stream: true
                };
                break;
                
            case 'anthropic':
                headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                body = {
                    model: modelName ?? defaultModels.anthropic,
                    max_tokens: maxTokens,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true
                };
                break;
                
            case 'ollama':
                headers = { 'Content-Type': 'application/json' };
                body = {
                    model: modelName ?? defaultModels.ollama,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true
                };
                break;
        }
        
        // 添加thinking支持
        if (enableThinking) {
            body.think = true;
        }
        
        // 添加temperature支持
        if (temperature !== null && temperature !== undefined && temperature.trim() !== '') {
            const tempFloat = parseFloat(temperature);
            if (!isNaN(tempFloat)) {
                if (provider === 'ollama') {
                    body.options = body.options ?? {};
                    body.options.temperature = tempFloat;
                } else {
                    body.temperature = tempFloat;
                }
            }
        }
        
        return { apiUrl, headers, body };
    }

    // 处理非流式响应
    async handleNonStreamResponse(response, provider, apiType) {
        const data = await response.json();
        let result = '';
        
        if (provider === 'openai' || provider === 'custom') {
            result = data.choices[0]?.message?.content;
        } else if (provider === 'anthropic') {
            result = data.content[0]?.text;
        } else if (provider === 'ollama') {
            if (data.message && data.message.thinking) {
                const thinkingKey = apiType === 'translation' ? 'prompts.translationThinking' : 'prompts.proofreadingThinking';
                console.log(languageManager.get(thinkingKey), data.message.thinking);
            }
            result = data.message?.content;
        }
        
        if (!result) {
            const errorKey = apiType === 'translation' ? 'errors.translationFailed' : 'errors.proofreadFailed';
            result = languageManager.get(errorKey);
        }
        
        // 提取并移除thinking标签
        const thinkingMatch = result.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            const thinkingKey = apiType === 'translation' ? 'prompts.translationThinking' : 'prompts.proofreadingThinking';
            console.log(languageManager.get(thinkingKey), thinkingMatch[1].trim());
            result = result.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        }
        
        return result || languageManager.get('errors.parseApiResponseFailed');
    }

    // 更新callTranslationAPI方法使用通用方法
    async callTranslationAPI(text, prompt, apiKey, provider, customEndpoint, modelName, context = null, abortController = null, blockIndex = null, temperature = null, enableThinking = false) {
        return await this.callLLMAPI(text, prompt, apiKey, provider, customEndpoint, modelName, context, abortController, blockIndex, temperature, enableThinking, 'translation');
    }

    // 通用流式响应处理方法
    async handleStreamResponse(response, blockIndex, provider, apiType) {
        if (provider === 'ollama') {
            return await this.handleOllamaStream(response, blockIndex, apiType);
        } else {
            return await this.handleSSEStream(response, blockIndex, provider, apiType);
        }
    }

    // 处理Ollama的流式响应（支持翻译和校对）
    async handleOllamaStream(response, blockIndex, apiType) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        let thinkingContent = '';
        let isThinkingPhase = true;

        // 获取对应的编辑器实例
        let editor, thinkingDiv;
        if (blockIndex !== null) {
            const translationBlock = document.querySelector(`[data-index="${blockIndex}"] .translation-block`);
            editor = this.translationEditors[blockIndex];

            // 创建thinking显示区域
            thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'translation-thinking-display';
            thinkingDiv.style.color = '#888';
            thinkingDiv.style.fontStyle = 'italic';
            thinkingDiv.style.fontSize = '0.9em';
            thinkingDiv.style.marginBottom = '8px';

            // 插入到编辑器容器之前
            const editorContainer = translationBlock?.querySelector('.editor-container');
            if (editorContainer && editorContainer.parentNode) {
                editorContainer.parentNode.insertBefore(thinkingDiv, editorContainer);
            }
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

                        // 处理thinking内容
                        if (data.message && data.message.thinking) {
                            thinkingContent += data.message.thinking;
                            
                            // 实时更新thinking显示
                            if (thinkingDiv && isThinkingPhase) {
                                thinkingDiv.textContent = thinkingContent;
                                thinkingDiv.scrollTop = thinkingDiv.scrollHeight;
                            }
                        }
                        
                        // 处理实际内容
                        if (data.message && data.message.content) {
                            // 第一次收到content时，清空thinking显示，开始显示内容
                            if (isThinkingPhase && thinkingDiv) {
                                thinkingDiv.style.display = 'none';
                                isThinkingPhase = false;
                            }
                            
                            result += data.message.content;

                            // 实时更新界面显示
                            this.updateBlockContent(editor, result, blockIndex);
                        }
                        
                        if (data.done) break;
                        
                    } catch (e) {
                        continue; // 忽略JSON解析错误
                    }
                }
            }
        } finally {
            reader.releaseLock();
            
            // 清理thinking显示元素
            if (thinkingDiv && thinkingDiv.parentNode) {
                thinkingDiv.parentNode.removeChild(thinkingDiv);
            }
        }
        
        const errorKey = apiType === 'translation' ? 'errors.translationFailed' : 'errors.proofreadFailed';
        return result || languageManager.get(errorKey);
    }

    // 处理SSE流式响应（OpenAI/Anthropic，支持翻译和校对）
    async handleSSEStream(response, blockIndex, provider, apiType) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';

        // 获取对应的编辑器实例
        let editor;
        if (blockIndex !== null) {
            editor = this.translationEditors[blockIndex];
        }
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value);
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
                            
                            this.updateBlockContent(editor, displayResult, blockIndex);
                        }
                    } catch (e) {
                        continue; // 忽略JSON解析错误
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        // 提取thinking部分并打印到控制台
        const thinkingMatch = result.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            const thinkingKey = apiType === 'translation' ? 'prompts.translationThinking' : 'prompts.proofreadingThinking';
            console.log(languageManager.get(thinkingKey), thinkingMatch[1].trim());
            result = result.replace(/<think>[\s\S]*?<\/think>\s*/, '').trim();
        }
        
        const errorKey = apiType === 'translation' ? 'errors.translationFailed' : 'errors.proofreadFailed';
        return result || languageManager.get(errorKey);
    }

    // 通用的块内容更新方法（editor 为 TipTap 编辑器实例）
    updateBlockContent(editor, content, blockIndex) {
        if (editor && blockIndex !== null) {
            editor.commands.setContent(window.tiptapTextToHtml(content), false);
            this.translationBlocks[blockIndex] = content;
            this.autoSaveProgress();
        }
    }
    // 更新callProofreadingAPI方法使用通用方法
    async callProofreadingAPI(originalText, translationText, prompt, apiKey, provider, customEndpoint, modelName, abortController = null, blockIndex = null, temperature = null, enableThinking = false) {
        return await this.callLLMAPI(originalText, prompt, apiKey, provider, customEndpoint, modelName, translationText, abortController, blockIndex, temperature, enableThinking, 'proofreading');
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

        const apiKey = document.getElementById('translation-api-key').value;
        const provider = document.getElementById('translation-api-provider').value;
        const modelName = document.getElementById('translation-model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            showError(languageManager.get('errors.apiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            showError(languageManager.get('errors.modelNameRequired'));
            return;
        }
        
        this.isTranslatingAll = true;
        const translateAllBtn = document.getElementById('translate-all-btn');
        translateAllBtn.disabled = false; // 保持按钮可点击以便停止
        translateAllBtn.innerHTML = '<span class="translation-loading-spinner"></span>' + languageManager.get('ui.buttons.stopTranslation');
        
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
                        const delay = parseInt(document.getElementById('translation-delay').value) ?? 0;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
        } catch (error) {
            showError(languageManager.get('errors.batchTranslationFailed') + error.message);
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
            return;
        }

        const apiKey = document.getElementById('translation-api-key').value;
        const prompt = document.getElementById('proofread-prompt').value;
        const provider = document.getElementById('proofread-api-provider').value ?? 'ollama';
        const customEndpoint = document.getElementById('proofread-api-endpoint').value;
        const modelName = document.getElementById('proofread-model-name').value;
        const temperatureValue = document.getElementById('proofread-temperature').value;
        const enableProofreadThinking = document.getElementById('proofread-enable-thinking').checked;

        if (!apiKey && provider !== 'ollama') {
            showError(languageManager.get('errors.proofreadApiKeyRequired'));
            return;
        }

        if (!modelName) {
            showError(languageManager.get('errors.proofreadModelNameRequired'));
            return;
        }

        if (!translationContent || translationContent.trim() === '') {
            showError(languageManager.get('errors.translateBeforeProofread'));
            return;
        }

        // 创建AbortController用于中断请求
        const abortController = new AbortController();
        this.activeProofreadings.set(index, abortController);
        
        // 更新按钮为中断状态
        translateBtn.innerHTML = '⏹';
        translateBtn.title = languageManager.get('ui.tooltips.stopProofreading');
        translateBtn.disabled = false;
        
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
                const editor = this.translationEditors[index];
                if (editor) {
                    editor.commands.setContent(window.tiptapTextToHtml(proofreadResult), false);
                }

                // 有新校对内容时，重置导出标记
                this.hasExported = false;

                // 自动保存翻译进度
                this.autoSaveProgress();
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                showError(languageManager.get('errors.proofreadingFailed') + error.message);
            }
        } finally {
            // 清理状态
            this.activeProofreadings.delete(index);
            translateBtn.innerHTML = '✓';
            translateBtn.title = languageManager.get('ui.tooltips.proofreadParagraph');
            translateBtn.disabled = false;
        }
    }


    async proofreadAll() {
        const apiKey = document.getElementById('proofread-api-key').value;
        const provider = document.getElementById('proofread-api-provider').value ?? 'ollama';
        const modelName = document.getElementById('proofread-model-name').value;
        
        if (!apiKey && provider !== 'ollama') {
            showError(languageManager.get('errors.proofreadApiKeyRequired'));
            return;
        }
        
        if (!modelName) {
            showError(languageManager.get('errors.proofreadModelNameRequired'));
            return;
        }
        
        const proofreadAllBtn = document.getElementById('proofread-all-btn');
        proofreadAllBtn.disabled = true;
        proofreadAllBtn.innerHTML = '<span class="translation-loading-spinner"></span>' + languageManager.get('messages.proofreading');
        
        try {
            for (let i = 0; i < this.originalBlocks.length; i++) {
                if (this.translationBlocks[i] && this.translationBlocks[i].trim()) {
                    await this.proofreadSingleBlock(i);
                    // 添加延迟以避免API限制
                    const delay = parseInt(document.getElementById('translation-delay').value) ?? 0;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } catch (error) {
            showError(languageManager.get('errors.batchProofreadingFailed') + error.message);
        } finally {
            proofreadAllBtn.disabled = false;
            proofreadAllBtn.innerHTML = languageManager.get('ui.buttons.proofreadAll');
        }
    }

    exportTranslation() {
        if (!this.currentFile || this.translationBlocks.length === 0) {
            showError(languageManager.get('errors.noTranslationContent'));
            return;
        }
        
        const translatedContent = this.translationBlocks
            .filter(block => block.trim())
            .join('\n\n');
            
        if (!translatedContent) {
            showError(languageManager.get('errors.noTranslatedContent'));
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
        const progressData = this.createProgressData();
        if (!progressData) {
            showError(languageManager.get('errors.noProgressToSave'));
            return;
        }
        
        const blob = new Blob([JSON.stringify(progressData, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name.replace(/\.(md|markdown)$/, '.translation_progress.json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleProgressUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.json')) {
            showError(languageManager.get('errors.loadProgressInvalidFormat'));
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const progressData = JSON.parse(e.target.result);
                
                // 兼容旧格式（数组）和新格式（包含filename的对象）
                let formattedData;
                if (Array.isArray(progressData)) {
                    // 旧格式，转换为新格式
                    formattedData = {
                        filename: 'loaded_progress.md',
                        blocks: progressData
                    };
                } else {
                    formattedData = progressData;
                }
                
                // 使用通用函数加载数据
                this.loadProgressFromData(formattedData, false);
                
                // 加载完成后自动保存进度
                this.autoSaveProgress();
                
            } catch (error) {
                showError(languageManager.get('errors.loadProgressFailed') + error.message);
            }
        };
        
        reader.onerror = () => {
            showError(languageManager.get('errors.loadProgressReadFailed'));
        };
        
        reader.readAsText(file, 'UTF-8');
        
        // 清空文件输入，以便可以重复选择同一文件
        event.target.value = '';
    }

    exportOriginal() {
        if (!this.currentFile || this.originalBlocks.length === 0) {
            showError(languageManager.get('errors.noOriginalContent'));
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
            showError(languageManager.get('errors.noTranslationContent'));
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
            showError(languageManager.get('errors.noTranslatedContent'));
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
        const settingsPanel = document.getElementById('translation-settings-panel');
        if (this.sidebarCollapsed) {
            settingsPanel.classList.add('collapsed');
        }
    }
    
    toggleSidebar() {
        const settingsPanel = document.getElementById('translation-settings-panel');
        this.sidebarCollapsed = !this.sidebarCollapsed;
        
        if (this.sidebarCollapsed) {
            settingsPanel.classList.add('collapsed');
        } else {
            settingsPanel.classList.remove('collapsed');
        }

        // 让 ">" 变成 "<"
        const collapseBtn = document.getElementById('translation-collapse-btn');
        const svg = collapseBtn.querySelector('svg');
        svg.style.transform = settingsPanel.classList.contains('collapsed') ? 'rotate(180deg)' : '';
        
        this.saveSettings();
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
        if (translateAllBtn.innerHTML.includes('translation-loading-spinner')) {
            translateAllBtn.innerHTML = '<span class="translation-loading-spinner"></span>' + languageManager.get('messages.translating');
        } else {
            translateAllBtn.innerHTML = languageManager.get('ui.buttons.translateAll');
        }
        
        // 重新加载当前语言的设置
        this.loadSettings();
    }

    reorganizeParagraphs() {
        if (!this.originalBlocks || this.originalBlocks.length === 0) {
            showError(languageManager.get('errors.noParagraphsToReorganize'));
            return;
        }

        const charLimit = parseInt(document.getElementById('translation-paragraph-char-limit').value);
        
        if (charLimit <= 0) {
            showError(languageManager.get('errors.invalidCharacterLimit'));
            return;
        }

        // 重新组织原文和译文段落 - 同时处理两个数组
        const result = this.mergeParagraphs(this.originalBlocks, this.translationBlocks, charLimit);

        // 更新数组
        this.originalBlocks = result.originalBlocks;
        this.translationBlocks = result.translationBlocks;

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

    // 创建进度数据对象的通用函数
    createProgressData() {
        if (!this.currentFile || this.originalBlocks.length === 0) {
            return null;
        }
        
        const progressData = {
            filename: this.currentFile.name,
            timestamp: Date.now(),
            blocks: []
        };
        
        for (let i = 0; i < this.originalBlocks.length; i++) {
            progressData.blocks.push({
                original_text: this.originalBlocks[i],
                translated_text: this.translationBlocks[i] ?? ''
            });
        }
        
        return progressData;
    }

    // 从进度数据加载到页面的通用函数
    loadProgressFromData(progressData, isAutoLoad = false) {
        try {
            // 验证数据格式
            if (!progressData || !progressData.blocks || !Array.isArray(progressData.blocks)) {
                throw new Error('Invalid progress data format');
            }
            
            // 验证每个block的格式
            for (let i = 0; i < progressData.blocks.length; i++) {
                const item = progressData.blocks[i];
                if (!item.hasOwnProperty('original_text') || !item.hasOwnProperty('translated_text')) {
                    throw new Error(languageManager.get('errors.loadProgressInvalidObject', {index: i+1}));
                }
            }
            
            // 加载数据到数组中
            this.originalBlocks = progressData.blocks.map(item => item.original_text);
            this.translationBlocks = progressData.blocks.map(item => item.translated_text);

            // 重置导出标记
            this.hasExported = false;
            
            // 使用保存的文件名创建文件对象
            this.currentFile = {
                name: progressData.filename || (isAutoLoad ? 'auto-saved.md' : 'loaded_progress.md')
            };
            
            // 重新渲染页面
            this.renderBlocks();
            this.updateFileInfo();
            
            // 启用相关按钮
            this.enableProgressButtons();
            
            if (isAutoLoad) {
                console.log('Auto-loaded translation progress for:', progressData.filename);
            }
            
        } catch (error) {
            throw error;
        }
    }

    // 启用进度相关按钮的通用函数
    enableProgressButtons() {
        document.getElementById('translate-all-btn').disabled = false;
        document.getElementById('translation-export-btn').disabled = false;
        document.getElementById('translation-export-alternating-btn').disabled = false;
        document.getElementById('translation-save-progress-btn').disabled = false;
        document.getElementById('translation-export-original-btn').disabled = false;
        document.getElementById('translation-reorganize-paragraphs-btn').disabled = false;
        
        // 如果处于校对模式，启用校对所有按钮
        if (this.proofreadingMode) {
            document.getElementById('proofread-all-btn').disabled = false;
        }
    }

    // 自动保存翻译进度到本地存储
    autoSaveProgress() {
        const progressData = this.createProgressData();
        if (!progressData) {
            return;
        }
        
        try {
            localStorage.setItem('markdown-translator-auto-save', JSON.stringify(progressData));
        } catch (error) {
            console.warn('Failed to auto-save translation progress:', error);
        }
        this.hasExported = true;
    }

    // 自动加载保存的翻译进度
    loadAutoSavedProgress() {
        try {
            const savedData = localStorage.getItem('markdown-translator-auto-save');
            if (!savedData) {
                return;
            }
            
            const progressData = JSON.parse(savedData);
            this.loadProgressFromData(progressData, true);
            
        } catch (error) {
            console.warn('Failed to load auto-saved translation progress:', error);
            // 如果加载失败，清除损坏的数据
            localStorage.removeItem('markdown-translator-auto-save');
        }
    }

    // 清除自动保存的进度
    clearAutoSavedProgress() {
        localStorage.removeItem('markdown-translator-auto-save');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    markdown_translator_instance = new MarkdownTranslator();
});