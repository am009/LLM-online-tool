class LanguageManager {
    constructor() {
        this.currentLanguage = 'zh-CN';
        this.translations = {};
        this.supportedLanguages = {
            'zh-CN': '中文',
            'en-US': 'English'
        };
        this.initialized = false;
    }

    async init() {
        // Load saved language preference or detect browser language
        this.currentLanguage = this.getSavedLanguage() || this.detectBrowserLanguage();
        
        // Load language files
        await this.loadLanguage(this.currentLanguage);
        
        this.initialized = true;
        
        // Apply translations to the page
        this.applyTranslations();
        
        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', this.currentLanguage);
    }

    getSavedLanguage() {
        return localStorage.getItem('markdown-translator-language');
    }

    saveLanguage(language) {
        localStorage.setItem('markdown-translator-language', language);
    }

    detectBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage;
        
        // Check if browser language is supported
        if (this.supportedLanguages[browserLang]) {
            return browserLang;
        }
        
        // Check if browser language without region is supported
        const langWithoutRegion = browserLang.split('-')[0];
        for (const supported in this.supportedLanguages) {
            if (supported.startsWith(langWithoutRegion)) {
                return supported;
            }
        }
        
        // Default to Chinese
        return 'zh-CN';
    }

    async loadLanguage(language) {
        try {
            const response = await fetch(`languages/${language}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load language file: ${language}`);
            }
            this.translations = await response.json();
        } catch (error) {
            console.error('Error loading language file:', error);
            // Fallback to Chinese if loading fails
            if (language !== 'zh-CN') {
                this.currentLanguage = 'zh-CN';
                await this.loadLanguage('zh-CN');
            }
        }
    }

    async switchLanguage(language) {
        if (!this.supportedLanguages[language]) {
            console.error('Unsupported language:', language);
            return;
        }

        this.currentLanguage = language;
        this.saveLanguage(language);
        
        await this.loadLanguage(language);
        this.applyTranslations();
        
        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', language);
        
        // Dispatch custom event for other components to listen
        window.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: language }
        }));
    }

    applyTranslations() {
        // Update text content using data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.get(key);
            if (translation) {
                element.textContent = translation;
            }
        });

        // Update placeholder attributes using data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.get(key);
            if (translation) {
                element.setAttribute('placeholder', translation);
            }
        });

        // Update title attributes using data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.get(key);
            if (translation) {
                element.setAttribute('title', translation);
            }
        });

        // Update value attributes for specific elements using data-i18n-value attribute
        document.querySelectorAll('[data-i18n-value]').forEach(element => {
            const key = element.getAttribute('data-i18n-value');
            const translation = this.get(key);
            if (translation) {
                element.setAttribute('value', translation);
            }
        });

        // Update document title
        const titleKey = document.querySelector('title')?.getAttribute('data-i18n');
        if (titleKey) {
            const translation = this.get(titleKey);
            if (translation) {
                document.title = translation;
            }
        }
    }

    get(key, params = {}) {
        if (!this.translations) {
            return key;
        }

        const keys = key.split('.');
        let value = this.translations;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return key; // Return key if translation not found
            }
        }

        // Simple parameter replacement
        if (typeof value === 'string' && Object.keys(params).length > 0) {
            Object.keys(params).forEach(param => {
                value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, 'g'), params[param]);
            });
        }

        return value || key;
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getSupportedLanguages() {
        return this.supportedLanguages;
    }

    isInitialized() {
        return this.initialized;
    }
}

// Create global instance
window.languageManager = new LanguageManager();