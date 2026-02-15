// ES module - load TipTap from esm.sh CDN
import { Editor } from 'https://esm.sh/@tiptap/core@2';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2';
import Image from 'https://esm.sh/@tiptap/extension-image@2';

// Custom Image extension with data-filename attribute
const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            'data-filename': {
                default: null,
                parseHTML: element => element.getAttribute('data-filename'),
                renderHTML: attributes => {
                    if (!attributes['data-filename']) return {};
                    return { 'data-filename': attributes['data-filename'] };
                },
            },
        };
    },
});

// Plain text -> HTML conversion (one <p> per line, with markdown image support)
function textToHtml(text) {
    if (!text) return '<p></p>';
    return text.split('\n').map(line => {
        // Process markdown images: ![alt](filename)
        const parts = [];
        let lastIndex = 0;
        const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;

        while ((match = imgRegex.exec(line)) !== null) {
            // Add escaped text before the image
            if (match.index > lastIndex) {
                const before = line.substring(lastIndex, match.index);
                parts.push(escapeHtml(before));
            }

            const alt = match[1];
            const filename = match[2];
            // Strip leading ./ for imageStore lookup
            const lookupName = filename.replace(/^\.\//, '');
            const url = window.imageStore ? (window.imageStore.getUrl(filename) || window.imageStore.getUrl(lookupName)) : '';
            parts.push(`<img src="${escapeHtml(url || '')}" alt="${escapeHtml(alt)}" data-filename="${escapeHtml(filename)}">`);

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text after last image
        if (lastIndex < line.length) {
            parts.push(escapeHtml(line.substring(lastIndex)));
        }

        if (parts.length === 0) {
            return '<p><br></p>';
        }

        return `<p>${parts.join('')}</p>`;
    }).join('');
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// HTML -> plain text via ProseMirror doc traversal (handles image nodes)
function htmlToText(editor) {
    const doc = editor.state.doc;
    const lines = [];

    doc.forEach(node => {
        if (node.type.name === 'paragraph') {
            let lineText = '';
            node.forEach(child => {
                if (child.type.name === 'image') {
                    const filename = child.attrs['data-filename'] || child.attrs.src || '';
                    const alt = child.attrs.alt || '';
                    lineText += `![${alt}](${filename})`;
                } else if (child.isText) {
                    lineText += child.text;
                }
            });
            lines.push(lineText);
        }
    });

    return lines.join('\n');
}

// Factory function to create a TipTap editor instance
window.createTipTapEditor = function(element, content, onUpdate) {
    const editor = new Editor({
        element,
        extensions: [
            StarterKit.configure({
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
            }),
            CustomImage.configure({
                inline: true,
                allowBase64: true,
            }),
        ],
        content: textToHtml(content),
        onUpdate: onUpdate ? ({ editor }) => onUpdate(htmlToText(editor)) : undefined,
    });
    return editor;
};

// Refresh all image src attributes in editors using current blob URLs
window.tiptapRefreshImages = function(editors) {
    if (!window.imageStore || !editors) return;

    editors.forEach(editor => {
        if (!editor) return;
        const { doc } = editor.state;
        const { tr } = editor.state;
        let modified = false;

        doc.descendants((node, pos) => {
            if (node.type.name === 'image') {
                const filename = node.attrs['data-filename'];
                if (filename) {
                    const lookupName = filename.replace(/^\.\//, '');
                    const newUrl = window.imageStore.getUrl(filename) || window.imageStore.getUrl(lookupName) || '';
                    if (node.attrs.src !== newUrl) {
                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            src: newUrl,
                        });
                        modified = true;
                    }
                }
            }
        });

        if (modified) {
            editor.view.dispatch(tr);
        }
    });
};

// Expose utility functions
window.tiptapTextToHtml = textToHtml;
window.tiptapHtmlToText = htmlToText;

// Signal that TipTap is ready
window.tiptapReady = true;
window.dispatchEvent(new Event('tiptap-ready'));
