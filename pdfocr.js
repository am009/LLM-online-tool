class PDFOCR {
    constructor() {
        // 配置 pdf.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        // 实例变量
        this.currentPDF = null;
        this.pageResults = new Map(); // 存储每页的OCR结果
        
        // DOM元素
        this.pdfInput = document.getElementById('ocr-pdf-input');
        this.progressInput = document.getElementById('ocr-progress-input');
        this.pagesContainer = document.getElementById('ocr-pages-container');
        this.fileInfo = document.getElementById('ocr-file-info');
        this.pageCount = document.getElementById('ocr-page-count');
        this.collapseBtn = document.getElementById('ocr-collapse-btn');
        this.settingsPanel = document.getElementById('ocr-settings-panel');
        this.exportBtn = document.getElementById('ocr-export-btn');
        this.saveProgressBtn = document.getElementById('ocr-save-progress-btn');
        this.loadProgressBtn = document.getElementById('ocr-load-progress-btn');
        this.recognizeAllBtn = document.getElementById('ocr-recognize-all-btn');
        this.batchActions = document.getElementById('ocr-batch-actions');
        this.progressInfo = document.getElementById('ocr-progress-info');
        this.autoScrollCheckbox = document.getElementById('ocr-auto-scroll');
        
        // 批量识别状态变量
        this.isRecognizing = false;
        this.shouldStopRecognizing = false;
        
        // 初始化事件监听器
        this.initEventListeners();
        
        // 初始化拖放功能
        this.initDragAndDrop();
        
        // 加载保存的设置
        this.loadSettings();
    }

    initEventListeners() {
        // 折叠/展开设置面板
        this.collapseBtn.addEventListener('click', () => {
            this.settingsPanel.classList.toggle('collapsed');
            const svg = this.collapseBtn.querySelector('svg');
            svg.style.transform = this.settingsPanel.classList.contains('collapsed') ? 'rotate(180deg)' : '';
        });
        
        // PDF文件上传处理
        this.pdfInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || file.type !== 'application/pdf') {
                showError(window.languageManager.get('pdfOcr.errors.invalidPdfFile'));
                return;
            }

            this.fileInfo.textContent = file.name;
            await this.loadPDF(file);
        });

        // 保存进度按钮事件监听
        this.saveProgressBtn.addEventListener('click', () => this.saveProgress());

        // 加载进度文件输入事件监听
        this.progressInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || file.type !== 'application/json') {
                alert(window.languageManager.get('pdfOcr.errors.invalidJsonFile'));
                return;
            }
            
            await this.loadProgress(file);
            // 清空输入以便重复选择同一文件
            e.target.value = '';
        });

        // 批量识别所有页面按钮事件监听
        this.recognizeAllBtn.addEventListener('click', () => {
            if (this.isRecognizing) {
                // 如果正在识别，则停止识别
                this.stopRecognizing();
            } else {
                // 开始批量识别
                this.recognizeAllPages();
            }
        });

        // 设置项自动保存事件监听
        this.initSettingsAutoSave();
    }
    
    // 初始化设置项自动保存
    initSettingsAutoSave() {
        // API 基础 URL
        const apiBaseInput = document.getElementById('ocr-api-base');
        if (apiBaseInput) {
            apiBaseInput.addEventListener('input', () => this.saveSettings());
        }
        
        // 自动滚动复选框
        if (this.autoScrollCheckbox) {
            this.autoScrollCheckbox.addEventListener('change', () => this.saveSettings());
        }
    }
    
    // 初始化拖放功能
    initDragAndDrop() {
        const dropZone = this.pagesContainer;
        
        // 防止默认的拖放行为
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // 拖放高亮效果
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.highlightDropZone(), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.unhighlightDropZone(), false);
        });
        
        // 处理文件拖放
        dropZone.addEventListener('drop', (e) => this.handleDrop(e), false);
    }
    
    // 防止默认拖放行为
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // 高亮拖放区域
    highlightDropZone() {
        this.pagesContainer.classList.add('drag-over');
    }
    
    // 取消高亮拖放区域
    unhighlightDropZone() {
        this.pagesContainer.classList.remove('drag-over');
    }
    
    // 处理文件拖放
    async handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            
            // 检查文件类型
            if (file.type !== 'application/pdf') {
                showError(window.languageManager.get('pdfOcr.errors.invalidPdfFile'));
                return;
            }
            
            // 更新文件信息并加载PDF
            this.fileInfo.textContent = file.name;
            await this.loadPDF(file);
        }
    }
    
    // 保存设置到本地存储
    saveSettings() {
        const settings = {
            apiBaseUrl: document.getElementById('ocr-api-base')?.value || '',
            autoScroll: this.autoScrollCheckbox?.checked || false,
            timestamp: Date.now()
        };
        
        localStorage.setItem('pdf-ocr-settings', JSON.stringify(settings));
    }
    
    // 从本地存储加载设置
    loadSettings() {
        try {
            const stored = localStorage.getItem('pdf-ocr-settings');
            if (!stored) return;
            
            const settings = JSON.parse(stored);
            
            // 应用API基础URL设置
            const apiBaseInput = document.getElementById('ocr-api-base');
            if (apiBaseInput && settings.apiBaseUrl) {
                apiBaseInput.value = settings.apiBaseUrl;
            }
            
            // 应用自动滚动设置
            if (this.autoScrollCheckbox && typeof settings.autoScroll === 'boolean') {
                this.autoScrollCheckbox.checked = settings.autoScroll;
            }
            
        } catch (error) {
            console.error('加载PDF OCR设置失败:', error);
        }
    }
    
    // 切换设置区块折叠状态
    toggleSection(headerElement) {
        const isCollapsed = headerElement.classList.contains('collapsed');
        const sectionContent = headerElement.nextElementSibling;
        
        if (isCollapsed) {
            headerElement.classList.remove('collapsed');
            sectionContent.classList.remove('collapsed');
        } else {
            headerElement.classList.add('collapsed');
            sectionContent.classList.add('collapsed');
        }
    }

    // 加载PDF文件
    async loadPDF(file) {
        try {
            // 显示加载状态
            this.pagesContainer.innerHTML = `<div class="pdfocr-loading">${window.languageManager.get('pdfOcr.messages.loadingPdf')}</div>`;
            
            // 读取文件
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.currentPDF = await loadingTask.promise;
            
            const numPages = this.currentPDF.numPages;
            this.pageCount.textContent = window.languageManager.get('pdfOcr.messages.pageCount', {count: numPages});
            
            // 清空容器并渲染所有页面
            this.pagesContainer.innerHTML = '';
            this.pageResults.clear();
            
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                await this.renderPageRow(pageNum);
            }
            
            // 启用导出按钮
            this.exportBtn.disabled = false;
            
        } catch (error) {
            console.error('加载PDF失败:', error);
            showError(window.languageManager.get('pdfOcr.errors.loadPdfFailed'))
            this.pagesContainer.innerHTML = `<div class="error">${window.languageManager.get('pdfOcr.errors.loadPdfFailed')}</div>`;
        }
    }

    // 渲染单个页面行
    async renderPageRow(pageNum) {
        const page = await this.currentPDF.getPage(pageNum);
        
        // 创建页面行容器
        const pageRow = document.createElement('div');
        pageRow.className = 'page-row';
        pageRow.dataset.pageNum = pageNum;
        
        // 不再显示页面编号
        
        // 创建图像容器
        const imageContainer = document.createElement('div');
        imageContainer.className = 'page-image-container';
        
        // 渲染页面为canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // 计算高DPI渲染参数
        const viewport = page.getViewport({ scale: 1.0 });
        // 设置高分辨率渲染（300 PPI）
        const renderScale = 2; // 300/72 ≈ 4.17
        const renderViewport = page.getViewport({ scale: renderScale });
        
        // 设置canvas实际尺寸（高分辨率）
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        
        // console.log(`Canvas width ${canvas.width} height ${canvas.height}`)
        // console.log(`renderViewport width ${renderViewport.width} height ${renderViewport.height}`)
        // canvas显示尺寸将由CSS控制，实现自适应缩放
        
        await page.render({
            canvasContext: context,
            viewport: renderViewport
        }).promise;
        
        imageContainer.appendChild(canvas);
        
        // 创建操作按钮区域
        const actionContainer = document.createElement('div');
        actionContainer.className = 'action-container';
        
        const ocrButton = document.createElement('button');
        ocrButton.className = 'btn btn-ocr';
        ocrButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
            </svg>
            ${window.languageManager.get('pdfOcr.buttons.recognize')}
        `;
        ocrButton.title = window.languageManager.get('pdfOcr.tooltips.recognizePage');
        ocrButton.onclick = () => this.performOCR(pageNum);
        
        actionContainer.appendChild(ocrButton);
        
        // 创建结果容器
        const resultContainer = document.createElement('div');
        resultContainer.className = 'result-container';
        
        // 创建标签页头部
        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'result-tabs';
        tabsHeader.style.display = 'none'; // 初始隐藏，直到有结果才显示
        
        const jsonTab = document.createElement('button');
        jsonTab.className = 'result-tab active';
        jsonTab.textContent = 'JSON';
        jsonTab.onclick = () => this.switchResultView(pageNum, 'json');
        
        const blocksTab = document.createElement('button');
        blocksTab.className = 'result-tab';
        blocksTab.textContent = window.languageManager.get('pdfOcr.ui.blocksView');
        blocksTab.onclick = () => this.switchResultView(pageNum, 'blocks');
        
        tabsHeader.appendChild(jsonTab);
        tabsHeader.appendChild(blocksTab);
        
        // 创建结果内容容器
        const resultContent = document.createElement('div');
        resultContent.className = 'result-content';
        
        // JSON视图
        const jsonView = document.createElement('div');
        jsonView.className = 'result-view json-view active';
        
        const jsonPlaceholder = document.createElement('div');
        jsonPlaceholder.className = 'result-placeholder';
        jsonPlaceholder.textContent = window.languageManager.get('pdfOcr.placeholders.clickRecognize');
        jsonView.appendChild(jsonPlaceholder);
        
        // 分块视图
        const blocksView = document.createElement('div');
        blocksView.className = 'result-view blocks-view';
        
        const blocksPlaceholder = document.createElement('div');
        blocksPlaceholder.className = 'result-placeholder';
        blocksPlaceholder.textContent = window.languageManager.get('pdfOcr.placeholders.viewBlocks');
        blocksView.appendChild(blocksPlaceholder);
        
        resultContent.appendChild(jsonView);
        resultContent.appendChild(blocksView);
        
        resultContainer.appendChild(tabsHeader);
        resultContainer.appendChild(resultContent);
        
        // 为图像容器添加高亮覆盖层
        const highlightOverlay = document.createElement('div');
        highlightOverlay.className = 'page-highlight-overlay';
        imageContainer.appendChild(highlightOverlay);
        
        // 组装页面行
        pageRow.appendChild(imageContainer);
        pageRow.appendChild(actionContainer);
        pageRow.appendChild(resultContainer);
        
        this.pagesContainer.appendChild(pageRow);
    }

    // 切换结果视图
    switchResultView(pageNum, viewType) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const tabs = pageRow.querySelectorAll('.result-tab');
        const views = pageRow.querySelectorAll('.result-view');
        
        // 更新标签页状态
        tabs.forEach(tab => tab.classList.remove('active'));
        views.forEach(view => view.classList.remove('active'));
        
        if (viewType === 'json') {
            pageRow.querySelector('.result-tab:first-child').classList.add('active');
            pageRow.querySelector('.json-view').classList.add('active');
        } else if (viewType === 'blocks') {
            pageRow.querySelector('.result-tab:last-child').classList.add('active');
            pageRow.querySelector('.blocks-view').classList.add('active');
            
            // 遍历相关的textarea，然后调整高度以适应内容
            const textareas = pageRow.querySelectorAll('.markdown-block-textarea');
            textareas.forEach(textarea => {
                textarea.style.height = '';
                textarea.style.height = (textarea.scrollHeight + 1) + 'px';
            });
        }
    }

    // 创建分块markdown视图
    createBlocksView(pageNum, ocrResult) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const blocksView = pageRow.querySelector('.blocks-view');
        const canvas = pageRow.querySelector('.page-image-container canvas');
        
        // 清空现有内容
        blocksView.innerHTML = '';
        
        if (!Array.isArray(ocrResult)) {
            blocksView.innerHTML = '<div class="result-placeholder">无效的OCR结果格式</div>';
            return;
        }
        
        // 为每个块创建可编辑区域
        ocrResult.forEach((block, index) => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'markdown-block';
            blockDiv.dataset.blockIndex = index;
            
            const header = document.createElement('div');
            header.className = 'markdown-block-header';
            header.textContent = `${block.category} [${block.bbox?.join(', ') || 'No bbox'}]`;
            
            // 添加鼠标悬停高亮功能
            blockDiv.addEventListener('mouseenter', () => {
                if (block.bbox) {
                    this.showHighlight(pageNum, block.bbox);
                }
            });
            
            blockDiv.addEventListener('mouseleave', () => {
                this.hideHighlight(pageNum);
            });
            
            blockDiv.appendChild(header);
            
            // 对于Picture类型的块，只显示header，不添加文本框
            if (block.category !== 'Picture') {
                const content = document.createElement('div');
                content.className = 'markdown-block-content';
                
                const textarea = document.createElement('textarea');
                textarea.className = 'markdown-block-textarea';
                textarea.value = block.text || '';
                textarea.placeholder = '此块暂无文本内容';
                textarea.setAttribute('oninput', 'this.style.height = "";this.style.height = (this.scrollHeight + 1) + "px"');

                // 绑定文本变化事件，同步到JSON数据
                textarea.addEventListener('input', (e) => {
                    this.updateBlockText(pageNum, index, e.target.value);
                });
                
                content.appendChild(textarea);
                blockDiv.appendChild(content);
            }
            
            blocksView.appendChild(blockDiv);
        });
    }

    // 显示bbox高亮
    showHighlight(pageNum, bbox) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const canvas = pageRow.querySelector('.page-image-container canvas');
        const overlay = pageRow.querySelector('.page-highlight-overlay');
        
        if (!canvas || !overlay || !bbox || bbox.length !== 4) return;
        
        // 清除现有高亮
        this.hideHighlight(pageNum);
        
        // 计算高亮框位置
        const [x1, y1, x2, y2] = bbox;
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = overlay.parentElement.getBoundingClientRect();
        
        // 计算缩放比例
        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;
        
        // 创建高亮框
        const highlightBox = document.createElement('div');
        highlightBox.className = 'page-highlight-box visible';
        
        // 设置位置和尺寸
        highlightBox.style.left = (x1 * scaleX) + 'px';
        highlightBox.style.top = (y1 * scaleY) + 'px';
        highlightBox.style.width = ((x2 - x1) * scaleX) + 'px';
        highlightBox.style.height = ((y2 - y1) * scaleY) + 'px';
        
        overlay.appendChild(highlightBox);
    }

    // 隐藏bbox高亮
    hideHighlight(pageNum) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const overlay = pageRow.querySelector('.page-highlight-overlay');
        
        if (overlay) {
            overlay.innerHTML = '';
        }
    }

    // 更新块文本并同步到JSON数据
    updateBlockText(pageNum, blockIndex, newText) {
        const result = this.pageResults.get(pageNum);
        if (result && result[blockIndex]) {
            result[blockIndex].text = newText;
            
            // 同步更新JSON视图
            this.updateJsonView(pageNum);
        }
    }

    // 更新JSON视图显示
    updateJsonView(pageNum) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const jsonView = pageRow.querySelector('.json-view');
        const textarea = jsonView.querySelector('.result-text');
        
        if (textarea) {
            const result = this.pageResults.get(pageNum);
            textarea.value = JSON.stringify(result, null, 2);
        }
    }

    // 执行OCR（使用dots.ocr流式API）
    async performOCR(pageNum) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        const resultContainer = pageRow.querySelector('.result-container');
        const ocrButton = pageRow.querySelector('.btn-ocr');
        const apiBaseUrl = document.getElementById('ocr-api-base').value;
        const jsonView = pageRow.querySelector('.json-view');
        const tabsHeader = pageRow.querySelector('.result-tabs');

        // 显示加载状态
        ocrButton.disabled = true;
        ocrButton.innerHTML = `
            <svg class="pdfocr-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v4m0 12v4m10-10h-4M6 12H2"/>
            </svg>
            识别中...
        `;
        
        // 创建实时显示的textarea放在JSON视图中
        const resultTextarea = document.createElement('textarea');
        resultTextarea.className = 'result-text';
        resultTextarea.placeholder = '正在获取识别结果...';
        resultTextarea.value = '';
        
        jsonView.innerHTML = '';
        jsonView.appendChild(resultTextarea);
        
        try {
            // 获取当前页面的图像数据
            const canvas = pageRow.querySelector('.page-image-container canvas');
            const imageDataUrl = canvas.toDataURL('image/png');
            
            // 准备API请求
            const requestBody = {
                image: imageDataUrl,
                prompt_type: "prompt_layout_all_en",
                stream: true
            };

            // 发起流式请求
            const response = await fetch(`${apiBaseUrl}/ocr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let combinedResponse = '';
            let isStreamComplete = false;

            // 读取流式响应
            while (!isStreamComplete) {
                const { value, done } = await reader.read();
                
                if (done) {
                    break;
                }

                // 解码数据
                buffer += decoder.decode(value, { stream: true });
                
                // 处理每一行JSON数据
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留不完整的行

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.response) {
                            combinedResponse += data.response;
                            // 实时更新textarea显示流式结果
                            resultTextarea.value = combinedResponse;
                            resultTextarea.scrollTop = resultTextarea.scrollHeight;
                        }
                        
                        if (data.done) {
                            isStreamComplete = true;
                            break;
                        }
                    } catch (e) {
                        console.error('解析JSON行失败:', line, e);
                    }
                }
            }

            // 流式获取结束，解析最终的JSON结果
            try {
                const finalResult = JSON.parse(combinedResponse);
                
                // 验证结果格式
                if (!Array.isArray(finalResult)) {
                    throw new Error('API返回的结果不是有效的JSON数组格式');
                }
                
                // 保存解析后的结果
                this.pageResults.set(pageNum, finalResult);
                
                // 显示标签页
                tabsHeader.style.display = 'flex';
                
                // 创建分块视图
                this.createBlocksView(pageNum, finalResult);
                
                // 更新按钮状态为成功
                ocrButton.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    已识别
                `;
                ocrButton.classList.add('success');
                
            } catch (parseError) {
                console.error('解析最终JSON结果失败:', parseError);
                resultTextarea.value = `JSON解析错误: ${parseError.message}\n\n原始响应:\n${combinedResponse}`;
                throw parseError;
            }

        } catch (error) {
            console.error('OCR识别失败:', error);
            
            // 显示错误信息
            resultTextarea.value = `识别失败: ${error.message}`;
            resultTextarea.className = 'result-text error';
            
            // 恢复按钮状态
            ocrButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                </svg>
                重试
            `;
            ocrButton.classList.remove('success');
        } finally {
            // 总是重新启用按钮
            ocrButton.disabled = false;
        }
    }

    // 保存进度功能
    saveProgress() {
        if (!this.currentPDF) {
            showError('请先上传PDF文件');
            return;
        }
        
        if (this.pageResults.size === 0) {
            showError('请先识别至少一页内容');
            return;
        }
        
        // 构建进度数据
        const progressData = {
            filename: this.fileInfo.textContent,
            pages: {}
        };
        
        // 收集所有页面的OCR结果
        for (let i = 1; i <= this.currentPDF.numPages; i++) {
            const result = this.pageResults.get(i);
            if (result) {
                progressData.pages[i] = result;
            }
        }
        
        // 创建并下载JSON文件
        const blob = new Blob([JSON.stringify(progressData, null, 2)], { 
            type: 'application/json;charset=utf-8' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${progressData.filename}.ocr_progress.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        alert('进度已保存');
    }

    // 加载进度功能
    async loadProgress(file) {
        try {
            // 优先检查文件格式和内容是否合法
            const text = await file.text();
            const progressData = JSON.parse(text);
            
            // 验证进度文件格式
            if (!progressData.filename || !progressData.pages) {
                throw new Error('进度文件格式无效：缺少必要字段');
            }
            
            // 然后检查是否已上传PDF文件，没有上传时提示应该上传的文件名
            if (!this.currentPDF) {
                const expectedFilename = progressData.filename || file.name.replace('_progress.json', '.pdf');
                showError(`请先上传PDF文件。建议上传文件名：${expectedFilename}`);
                return;
            }
            
            // 恢复OCR结果到现有页面
            const pageNumbers = Object.keys(progressData.pages).map(num => parseInt(num));
            
            for (const pageNum of pageNumbers) {
                const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
                if (pageRow) {
                    const jsonView = pageRow.querySelector('.json-view');
                    const tabsHeader = pageRow.querySelector('.result-tabs');
                    const ocrButton = pageRow.querySelector('.btn-ocr');
                    
                    // 创建结果文本区域
                    const resultTextarea = document.createElement('textarea');
                    resultTextarea.className = 'result-text';
                    resultTextarea.value = JSON.stringify(progressData.pages[pageNum], null, 2);
                    
                    jsonView.innerHTML = '';
                    jsonView.appendChild(resultTextarea);
                    
                    // 显示标签页
                    tabsHeader.style.display = 'flex';
                    
                    // 创建分块视图
                    this.createBlocksView(pageNum, progressData.pages[pageNum]);
                    
                    // 更新按钮状态
                    ocrButton.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        已识别
                    `;
                    ocrButton.classList.add('success');
                    
                    // 存储OCR结果
                    this.pageResults.set(pageNum, progressData.pages[pageNum]);

                    // 切换到分块视图
                    this.switchResultView(pageNum, 'blocks')
                }
            }
            
            alert(`已成功加载进度：${progressData.filename}，共 ${pageNumbers.length} 页`);
            
        } catch (error) {
            console.error('加载进度失败:', error);
            showError(`加载进度失败: ${error.message}`);
        }
    }

    // 导出markdown功能
    async generateMarkdownExport() {
        if (this.pageResults.size === 0) {
            showError('请先识别至少一页内容');
            return;
        }
        let markdown = '';
        let footnoteCounter = 1;
        const images = []; // 存储需要生成的图片信息
        
        // 按页面顺序处理所有识别结果
        for (let pageNum = 1; pageNum <= this.currentPDF.numPages; pageNum++) {
            const pageResult = this.pageResults.get(pageNum);
            if (!pageResult || !Array.isArray(pageResult)) continue;
            
            // 处理当前页面的每个块
            for (let i = 0; i < pageResult.length; i++) {
                const block = pageResult[i];
                
                // 跳过页眉和页脚
                if (block.category === 'Page-footer' || block.category === 'Page-header') {
                    continue;
                }
                
                // 处理Picture类型的块
                if (block.category === 'Picture') {
                    const filename = this.fileInfo.textContent.replace('.pdf', '');
                    const [x1, y1, x2, y2] = block.bbox;
                    const imageName = `${filename}_page_${pageNum}_${x1}_${x2}_${y1}_${y2}.png`;
                    
                    // 存储图片信息用于后续生成
                    images.push({
                        pageNum: pageNum,
                        bbox: block.bbox,
                        filename: imageName
                    });
                    
                    // 检查下一个块是否是Caption
                    let caption = '';
                    if (i + 1 < pageResult.length && pageResult[i + 1].category === 'Caption') {
                        caption = pageResult[i + 1].text || '';
                        i++; // 跳过下一个Caption块，因为已经处理了
                    }
                    
                    // 在markdown中插入图片引用
                    if (caption) {
                        markdown += `![${caption}](./${imageName})\n\n`;
                    } else {
                        markdown += `![](./${imageName})\n\n`;
                    }
                    continue;
                }
                
                // 处理Footnote类型的块
                if (block.category === 'Footnote') {
                    if (block.text) {
                        markdown += `[^${footnoteCounter}]: ${block.text}\n\n`;
                        footnoteCounter++;
                    }
                    continue;
                }
                
                // 处理其他有文本内容的块
                if (block.text && block.text.trim()) {
                    markdown += block.text + '\n\n';
                }
            }
        }
        
        // 生成并下载图片文件
        await this.generateImages(images);
        
        // 下载markdown文件
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = this.fileInfo.textContent.replace('.pdf', '.md');
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        alert(`Markdown已导出，包含 ${images.length} 张图片`);
    }

    // 生成图片文件
    async generateImages(images) {
        for (const imageInfo of images) {
            try {
                // 获取对应页面的canvas
                const pageRow = document.querySelector(`.page-row[data-page-num="${imageInfo.pageNum}"]`);
                if (!pageRow) continue;
                
                const canvas = pageRow.querySelector('.page-image-container canvas');
                if (!canvas) continue;
                
                // 创建新的canvas用于裁剪
                const cropCanvas = document.createElement('canvas');
                const cropCtx = cropCanvas.getContext('2d');
                
                const [x1, y1, x2, y2] = imageInfo.bbox;
                const width = x2 - x1;
                const height = y2 - y1;
                
                // 设置裁剪canvas尺寸
                cropCanvas.width = width;
                cropCanvas.height = height;
                
                // 从原始canvas裁剪图像
                cropCtx.drawImage(canvas, x1, y1, width, height, 0, 0, width, height);
                
                // 转换为blob并下载
                cropCanvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = imageInfo.filename;
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                }, 'image/png');
                
            } catch (error) {
                console.error(`生成图片 ${imageInfo.filename} 失败:`, error);
            }
        }
    }

    // 滚动到指定页面
    scrollToPage(pageNum) {
        const pageRow = document.querySelector(`.page-row[data-page-num="${pageNum}"]`);
        if (pageRow) {
            pageRow.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    // 停止批量识别
    stopRecognizing() {
        this.shouldStopRecognizing = true;
        this.progressInfo.textContent = window.languageManager.get('pdfOcr.messages.stopping');
        
        // 立即更新按钮状态为停止中
        this.recognizeAllBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
            </svg>
            停止中...
        `;
        this.recognizeAllBtn.disabled = true;
    }

    // 批量识别所有页面
    async recognizeAllPages() {
        if (!this.currentPDF) {
            showError('请先上传PDF文件');
            return;
        }
        
        const numPages = this.currentPDF.numPages;
        const unrecognizedPages = [];
        
        // 查找未识别的页面
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (!this.pageResults.has(pageNum)) {
                unrecognizedPages.push(pageNum);
            }
        }
        
        if (unrecognizedPages.length === 0) {
            alert(window.languageManager.get('pdfOcr.messages.allPagesRecognized'));
            return;
        }
        
        // 设置识别状态
        this.isRecognizing = true;
        this.shouldStopRecognizing = false;
        
        // 更新按钮为停止状态
        this.recognizeAllBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
            </svg>
            停止识别
        `;
        this.recognizeAllBtn.disabled = false;
        
        let completedCount = 0;
        let hasErrors = false;
        
        try {
            // 顺序识别每个未识别的页面
            for (const pageNum of unrecognizedPages) {
                // 检查是否需要停止
                if (this.shouldStopRecognizing) {
                    this.progressInfo.textContent = `识别已停止，已完成 ${completedCount}/${unrecognizedPages.length} 页`;
                    break;
                }
                
                this.progressInfo.textContent = `正在识别第 ${pageNum} 页 (${completedCount + 1}/${unrecognizedPages.length})`;
                
                // 如果启用了自动滚动，滚动到当前页面
                if (this.autoScrollCheckbox.checked) {
                    this.scrollToPage(pageNum);
                    // 给一点时间让滚动完成
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                try {
                    await this.performOCR(pageNum);
                    completedCount++;
                    
                    // 检查是否在识别过程中被停止
                    if (this.shouldStopRecognizing) {
                        this.progressInfo.textContent = `识别已停止，已完成 ${completedCount}/${unrecognizedPages.length} 页`;
                        break;
                    }
                    
                    this.progressInfo.textContent = `已完成 ${completedCount}/${unrecognizedPages.length} 页`;
                } catch (error) {
                    console.error(`识别第 ${pageNum} 页失败:`, error);
                    hasErrors = true;
                }
            }
            
            // 显示完成信息
            if (this.shouldStopRecognizing) {
                alert(`识别已停止！已完成 ${completedCount} 页。`);
            } else if (hasErrors) {
                this.progressInfo.textContent = `批量识别完成，共 ${completedCount}/${unrecognizedPages.length} 页成功`;
                alert(`批量识别完成！成功识别 ${completedCount} 页，${unrecognizedPages.length - completedCount} 页失败。请查看具体页面的错误信息。`);
            } else {
                this.progressInfo.textContent = `批量识别完成，共 ${completedCount} 页`;
                alert(`批量识别完成！成功识别所有 ${completedCount} 页。`);
            }
            
        } catch (error) {
            console.error('批量识别过程中发生错误:', error);
            this.progressInfo.textContent = `批量识别中断，已完成 ${completedCount} 页`;
            showError(`批量识别过程中发生错误: ${error.message}`);
        } finally {
            // 重置识别状态
            this.isRecognizing = false;
            this.shouldStopRecognizing = false;
            
            // 恢复按钮状态
            this.recognizeAllBtn.disabled = false;
            this.recognizeAllBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                </svg>
                识别所有页面
            `;
            
            // 清理进度信息 (5秒后)
            setTimeout(() => {
                if (!this.isRecognizing) {
                    this.progressInfo.textContent = '';
                }
            }, 5000);
        }
    }
}

// 全局函数，供HTML调用
function toggleSection(headerElement) {
    if (window.pdfOCR) {
        window.pdfOCR.toggleSection(headerElement);
    }
}

// 初始化应用
window.addEventListener('DOMContentLoaded', () => {
    window.pdfOCR = new PDFOCR();
    
    // 为导出按钮添加事件监听器
    const exportBtn = document.getElementById('ocr-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.pdfOCR.generateMarkdownExport();
        });
    }
});