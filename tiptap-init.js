// ES module - load TipTap from esm.sh CDN
import { Editor } from 'https://esm.sh/@tiptap/core@2';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2';

// Plain text -> HTML conversion (one <p> per line, preserving line structure)
function textToHtml(text) {
    if (!text) return '<p></p>';
    return text.split('\n').map(line => {
        const escaped = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<p>${escaped || '<br>'}</p>`;
    }).join('');
}

// HTML -> plain text via ProseMirror API
function htmlToText(editor) {
    const doc = editor.state.doc;
    return doc.textBetween(0, doc.content.size, '\n');
}

// Factory function to create a TipTap editor instance
window.createTipTapEditor = function(element, content, onUpdate) {
    const editor = new Editor({
        element,
        extensions: [StarterKit.configure({
            // Disable rich-text extensions, keep it plain-text-like
            heading: false,
            bold: false,
            italic: false,
            strike: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            codeBlock: false,
            horizontalRule: false,
            listItem: false,
        })],
        content: textToHtml(content),
        onUpdate: onUpdate ? ({ editor }) => onUpdate(htmlToText(editor)) : undefined,
    });
    return editor;
};

// Expose utility functions
window.tiptapTextToHtml = textToHtml;
window.tiptapHtmlToText = htmlToText;

// Signal that TipTap is ready
window.tiptapReady = true;
window.dispatchEvent(new Event('tiptap-ready'));
