import { CONFIG, SETTINGS } from '../modules/config.js';
import { settingsManager } from '../modules/settings-manager.js';
import { archivistApi } from '../services/archivist-api.js';

/**
 * Standalone Archivist Chat window (per-user)
 * Maintains local chat history (client-scoped setting), trims to last 10 turns when sending.
 */
export class AskChatWindow extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'archivist-ask-chat',
            title: game.i18n.localize('ARCHIVIST_SYNC.chat.title'),
            template: 'modules/archivist-sync/templates/ask-chat-window.hbs',
            classes: ['archivist-sync-chat'],
            width: 520,
            height: 620,
            resizable: true
        });
    }

    constructor(options = {}) {
        super(options);
        this._messages = this._loadHistory();
        this._streamAbort = null;
        this._isStreaming = false;
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

    getData() {
        return {
            messages: this._messages,
            isStreaming: this._isStreaming,
            placeholder: game.i18n.localize('ARCHIVIST_SYNC.chat.placeholder')
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html.querySelector('.ask-form');
        const input = html.querySelector('.ask-input');
        const stopBtn = html.querySelector('.ask-stop');
        form?.addEventListener('submit', (e) => { e.preventDefault(); const text = input?.value?.trim(); if (text) this._onSend(text); });
        stopBtn?.addEventListener('click', () => this._stopStream());
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
        // Append a placeholder assistant message for streaming
        const assistantMsg = { role: 'assistant', content: '', from: 'assistant', at: Date.now() };
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
                    assistantMsg.content += chunk;
                    this.render(false);
                },
                () => {
                    this._isStreaming = false;
                    this._streamAbort = null;
                    this._saveHistory();
                    this.render(false);
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

