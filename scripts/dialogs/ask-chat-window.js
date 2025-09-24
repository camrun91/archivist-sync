import { CONFIG, SETTINGS } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';

/**
 * Standalone Archivist Chat window (per-user)
 * Maintains local chat history (client-scoped setting), trims to last 10 turns when sending.
 */
export class AskChatWindow {
    constructor(options = {}) {
        this._messages = this._loadHistory();
        this._streamAbort = null;
        this._isStreaming = false;
        this._mountEl = null; // optional host element when embedding in sidebar
    }

    _loadHistory() {
        try {
            const raw = game.settings.get(CONFIG.MODULE_ID, SETTINGS.CHAT_HISTORY.key) || '{}';
            const byUser = JSON.parse(raw);
            const key = this._historyKey();
            return Array.isArray(byUser[key]) ? byUser[key] : [];
        } catch (_) { return []; }
    }

    _saveHistory() {
        try {
            const raw = game.settings.get(CONFIG.MODULE_ID, SETTINGS.CHAT_HISTORY.key) || '{}';
            const byUser = JSON.parse(raw || '{}');
            const key = this._historyKey();
            byUser[key] = this._messages.slice(-40); // keep more locally, trim on send
            game.settings.set(CONFIG.MODULE_ID, SETTINGS.CHAT_HISTORY.key, JSON.stringify(byUser));
        } catch (e) { console.warn('[Archivist Sync] Failed saving chat history', e); }
    }

    _historyKey() {
        const uid = game.user?.id || 'anon';
        const wid = settingsManager.getSelectedWorldId() || 'no-world';
        return `${uid}:${wid}`;
    }

    async getData() {
        // Pre-enrich assistant messages to support markdown/basic HTML
        const enriched = [];
        for (const m of this._messages) {
            if (m.role === 'assistant') {
                const TextEditorImpl = (foundry?.applications?.ux?.TextEditor?.implementation) || globalThis.TextEditor;
                const html = await TextEditorImpl.enrichHTML(String(m.content ?? ''), { async: true });
                enriched.push({ ...m, html });
            } else {
                enriched.push(m);
            }
        }
        return {
            messages: enriched,
            isStreaming: this._isStreaming,
            placeholder: game.i18n.localize('ARCHIVIST_SYNC.chat.placeholder')
        };
    }

    activateListeners(html) {
        const root = html?.[0] ?? html ?? this._mountEl; // support jQuery or HTMLElement or mounted host
        const form = root?.querySelector?.('.ask-form');
        const input = root?.querySelector?.('.ask-input');
        const clearBtn = root?.querySelector?.('.chat-clear-btn');
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input?.value?.trim();
            if (text) {
                this._onSend(text);
                if (input) input.value = '';
            }
        });

        clearBtn?.addEventListener('click', async () => {
            const ok = await Dialog.confirm({
                title: game.i18n.localize('ARCHIVIST_SYNC.chat.clear'),
                content: `<p>${game.i18n.localize('ARCHIVIST_SYNC.chat.clearConfirm')}</p>`
            });
            if (!ok) return;
            this._messages = [];
            this._saveHistory();
            this.render(false);
        });
    }

    async render(_force) {
        if (!this._mountEl) return;
        const data = await this.getData();
        const html = await foundry.applications.handlebars.renderTemplate('modules/archivist-sync/templates/ask-chat-window.hbs', data);
        this._mountEl.innerHTML = html;
        this.activateListeners(this._mountEl);
        try {
            const msgList = this._mountEl.querySelector?.('.messages');
            if (msgList) msgList.scrollTop = msgList.scrollHeight;
        } catch (_) { }
    }

    async _onSend(text) {
        if (!settingsManager.isApiConfigured()) {
            return ui.notifications?.warn(game.i18n.localize('ARCHIVIST_SYNC.chat.noApi'));
        }
        if (!settingsManager.isWorldSelected()) {
            return ui.notifications?.warn(game.i18n.localize('ARCHIVIST_SYNC.chat.noWorld'));
        }

        const userMsg = { role: 'user', content: text, from: 'me', at: Date.now() };
        this._messages.push(userMsg);
        // Append a placeholder assistant message for streaming; typing indicator inline
        const assistantMsg = { role: 'assistant', content: '', from: 'assistant', at: Date.now(), typing: true };
        this._messages.push(assistantMsg);
        this.render(false);
        this._saveHistory();

        // Prepare last 10 messages in API schema (role/content only)
        const recent = this._messages
            .map(m => ({ role: m.role, content: String(m.content ?? '') }))
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-10);

        const apiKey = settingsManager.getApiKey();
        const worldId = settingsManager.getSelectedWorldId();
        this._isStreaming = true; this.render(false);
        const controller = new AbortController();
        this._streamAbort = controller;
        try {
            await archivistApi.askStream(
                apiKey,
                worldId,
                recent,
                (chunk) => {
                    if (assistantMsg.typing) assistantMsg.typing = false;
                    assistantMsg.content += chunk;
                    // Try incremental DOM update to avoid full re-render jank
                    let updated = false;
                    try {
                        const host = this._mountEl || this.element || this.element?.[0];
                        const container = host?.querySelector?.('.messages');
                        const rows = container?.querySelectorAll?.('.msg');
                        const lastRow = rows?.[rows.length - 1];
                        const bubble = lastRow?.querySelector?.('.bubble');
                        if (bubble) {
                            bubble.textContent = String(assistantMsg.content);
                            container.scrollTop = container.scrollHeight;
                            updated = true;
                        }
                    } catch (_) { }
                    if (!updated) {
                        this.render(false);
                    }
                },
                () => {
                    this._isStreaming = false;
                    this._streamAbort = null;
                    this._saveHistory();
                    this.render(false); // final render to enrich markdown
                },
                controller.signal
            );
        } catch (e) {
            console.error('[Archivist Sync] Chat error', e);
            this._isStreaming = false; this._streamAbort = null;
            ui.notifications?.error(game.i18n.localize('ARCHIVIST_SYNC.chat.error'));
            this.render(false);
        }
    }

    _stopStream() {
        if (this._streamAbort) {
            try { this._streamAbort.abort(); } catch (_) { }
            this._isStreaming = false; this._streamAbort = null; this.render(false);
        }
    }
}

export default AskChatWindow;

