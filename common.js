class ErrorModal {
    constructor() {
        this.modal = null;
        this.messageEl = null;
        this.init();
    }

    init() {
        this.modal = document.getElementById('error-modal');
        this.messageEl = document.getElementById('error-message');
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.modal) return;
        
        const closeBtn = this.modal.querySelector('.close');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });
    }

    showError(message) {
        if (!this.modal || !this.messageEl) return;
        
        this.messageEl.textContent = message;
        this.modal.style.display = 'block';
    }

    hideModal() {
        if (!this.modal) return;
        
        this.modal.style.display = 'none';
    }
}

// HTML escaping function for special characters
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 创建全局实例
let errorModal;

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    errorModal = new ErrorModal();
});

// 导出函数供其他代码使用
function showError(message) {
    if (errorModal) {
        errorModal.showError(message);
    }
}