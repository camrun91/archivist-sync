import { AskChatWindow } from '../dialogs/ask-chat-window.js';

export class AskChatSidebarTab extends foundry.applications.sidebar.AbstractSidebarTab {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
        id: 'archivist-chat',
        title: game.i18n?.localize?.('ARCHIVIST_SYNC.Menu.AskChat.Label') ?? 'Archivist Chat',
        icon: 'fa-solid fa-sparkles',
        template: 'modules/archivist-sync/templates/ask-chat-window.hbs',
        popOut: false
    });

    async getData(options) {
        if (!this.chatApp) this.chatApp = new AskChatWindow({ popOut: false });
        return this.chatApp.getData();
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.chatApp) this.chatApp = new AskChatWindow({ popOut: false });
        const el = this.element;
        if (el) {
            el.style.height = '100%';
            el.style.overflow = 'hidden';
            this.chatApp.element = el;
            this.chatApp.activateListeners(el);
            const msgList = el.querySelector?.('.messages');
            if (msgList) msgList.scrollTop = msgList.scrollHeight;
        }
    }
}

export default AskChatSidebarTab;
