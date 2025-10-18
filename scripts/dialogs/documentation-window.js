/**
 * Documentation window that displays the README.md content
 * Uses ApplicationV2 framework for Foundry v13
 */
export class DocumentationWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'archivist-documentation',
        window: {
            title: 'Archivist Sync Documentation',
            resizable: true,
            minimizable: true,
        },
        classes: ['archivist', 'documentation'],
        position: { width: 800, height: 600 },
        actions: {},
    };

    constructor(options = {}) {
        super(options);
        this._readmeContent = null;
    }

    async _prepareContext(_options) {
        // Fetch the README.md content if not already loaded
        if (!this._readmeContent) {
            this._readmeContent = await this._fetchReadme();
        }
        return {
            content: this._readmeContent,
        };
    }

    async _fetchReadme() {
        try {
            const response = await fetch('modules/archivist-sync/README.md');
            if (!response.ok) {
                return '<p>Unable to load documentation. Please visit the <a href="https://github.com/camrun91/archivist-sync" target="_blank">GitHub repository</a> for documentation.</p>';
            }
            const markdown = await response.text();
            // Convert markdown to HTML using a simple approach
            // For full markdown support, you might want to use a library like marked.js
            return this._convertMarkdownToHtml(markdown);
        } catch (error) {
            console.error('[Archivist Sync] Failed to load README:', error);
            return '<p>Unable to load documentation. Please visit the <a href="https://github.com/camrun91/archivist-sync" target="_blank">GitHub repository</a> for documentation.</p>';
        }
    }

    _convertMarkdownToHtml(markdown) {
        // Split into lines for better processing
        const lines = markdown.split('\n');
        const output = [];
        let inCodeBlock = false;
        let codeBlockLang = '';
        let codeBlockContent = [];
        let inList = false;
        let listType = '';
        let listItems = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Handle code blocks
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeBlockLang = line.substring(3).trim();
                    codeBlockContent = [];
                } else {
                    inCodeBlock = false;
                    output.push(`<pre><code class="language-${codeBlockLang}">${this._escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
                    codeBlockContent = [];
                }
                continue;
            }

            if (inCodeBlock) {
                codeBlockContent.push(line);
                continue;
            }

            // Close any open list if we're not in a list line
            if (inList && !line.match(/^[\-\*]\s+/) && !line.match(/^\d+\.\s+/) && line.trim() !== '') {
                output.push(listType === 'ul' ? '</ul>' : '</ol>');
                inList = false;
                listItems = [];
            }

            // Headers
            if (line.startsWith('### ')) {
                output.push(`<h3>${this._processInline(line.substring(4))}</h3>`);
            } else if (line.startsWith('## ')) {
                output.push(`<h2>${this._processInline(line.substring(3))}</h2>`);
            } else if (line.startsWith('# ')) {
                output.push(`<h1>${this._processInline(line.substring(2))}</h1>`);
            }
            // Unordered lists
            else if (line.match(/^[\-\*]\s+/)) {
                const content = line.replace(/^[\-\*]\s+/, '');
                if (!inList || listType !== 'ul') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ul>');
                    inList = true;
                    listType = 'ul';
                }
                output.push(`<li>${this._processInline(content)}</li>`);
            }
            // Ordered lists
            else if (line.match(/^\d+\.\s+/)) {
                const content = line.replace(/^\d+\.\s+/, '');
                if (!inList || listType !== 'ol') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ol>');
                    inList = true;
                    listType = 'ol';
                }
                output.push(`<li>${this._processInline(content)}</li>`);
            }
            // Empty lines
            else if (line.trim() === '') {
                if (inList) {
                    output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    inList = false;
                }
                // Don't add extra paragraphs for empty lines
            }
            // Regular paragraphs
            else {
                output.push(`<p>${this._processInline(line)}</p>`);
            }
        }

        // Close any open lists
        if (inList) {
            output.push(listType === 'ul' ? '</ul>' : '</ol>');
        }

        return `<div class="archivist-documentation-content">${output.join('\n')}</div>`;
    }

    _processInline(text) {
        return text
            // Images (before links) - preserve URL encoding
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
                // Trim any whitespace from URL and ensure proper encoding
                const cleanUrl = url.trim();
                // Add loading and error handling attributes
                return `<img src="${cleanUrl}" alt="${alt}" loading="lazy" onerror="console.error('Failed to load image:', '${cleanUrl}')" />`;
            })
            // Links - preserve URL encoding
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                const cleanUrl = url.trim();
                return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            })
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic (but not inside already processed elements)
            .replace(/\*([^\*]+?)\*/g, '<em>$1</em>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async _renderHTML(context, _options) {
        const html = `
      <div class="archivist-documentation">
        <style>
          .archivist-documentation {
            padding: 20px;
            overflow-y: auto;
            height: 100%;
            background: #1a1a1a;
            color: #e8e8e8;
          }
          .archivist-documentation-content {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.7;
            color: #e8e8e8;
            max-width: 900px;
          }
          .archivist-documentation-content h1 {
            font-size: 2em;
            margin-top: 0.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            color: #ffffff;
            border-bottom: 2px solid #444;
            padding-bottom: 0.3em;
          }
          .archivist-documentation-content h2 {
            font-size: 1.5em;
            margin-top: 1em;
            margin-bottom: 0.5em;
            font-weight: 600;
            color: #f0f0f0;
            border-bottom: 1px solid #444;
            padding-bottom: 0.3em;
          }
          .archivist-documentation-content h3 {
            font-size: 1.25em;
            margin-top: 1em;
            margin-bottom: 0.5em;
            font-weight: 600;
            color: #e8e8e8;
          }
          .archivist-documentation-content code {
            background: rgba(255, 255, 255, 0.1);
            color: #ffa07a;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 90%;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .archivist-documentation-content pre {
            background: rgba(0, 0, 0, 0.3);
            padding: 16px;
            overflow: auto;
            border-radius: 6px;
            margin: 1em 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .archivist-documentation-content pre code {
            background: transparent;
            color: #c9d1d9;
            padding: 0;
            border: none;
            font-size: 90%;
            line-height: 1.45;
          }
          .archivist-documentation-content ul,
          .archivist-documentation-content ol {
            padding-left: 2em;
            margin: 0.5em 0;
          }
          .archivist-documentation-content li {
            margin: 0.35em 0;
            color: #e8e8e8;
          }
          .archivist-documentation-content a {
            color: #58a6ff;
            text-decoration: none;
          }
          .archivist-documentation-content a:hover {
            text-decoration: underline;
            color: #79c0ff;
          }
          .archivist-documentation-content img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1em 0;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .archivist-documentation-content p {
            margin: 0.75em 0;
            color: #d4d4d4;
          }
          .archivist-documentation-content strong {
            font-weight: 600;
            color: #f0f0f0;
          }
          .archivist-documentation-content em {
            font-style: italic;
            color: #e8e8e8;
          }
        </style>
        ${context.content}
      </div>
    `;
        return html;
    }

    _replaceHTML(result, content, options) {
        // Replace the entire content area with the new HTML
        content.innerHTML = result;
    }
}

