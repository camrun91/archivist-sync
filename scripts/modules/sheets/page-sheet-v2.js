import { CONFIG } from '../../modules/config.js';
import { settingsManager } from '../../modules/settings-manager.js';
import { archivistApi } from '../../services/archivist-api.js';
import { linkDocs, unlinkDocs, setLocationParent } from '../../modules/links/helpers.js';
import { Utils } from '../../modules/utils.js';

const V2 = foundry.applications.api;

class ArchivistBasePageSheetV2 extends V2.HandlebarsApplicationMixin(V2.DocumentSheetV2) {
    constructor(options = {}) {
        super(options);
        // Track editing state for the Info section across page-based sheets
        this._editingInfo = false;
        // Global edit mode toggle (controls title + info editability)
        this._editMode = false;
        // Track the currently selected tab across renders
        this._activeTab = 'info';
    }
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        id: 'archivist-page-sheet-{id}',
        classes: ['archivist-sync', 'archivist-v2-sheet'],
        sheetConfig: true,
        window: { ...super.DEFAULT_OPTIONS.window, icon: 'fa-solid fa-book', resizable: true },
        position: { width: 800, height: 700 },
    };

    static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/base.hbs' } };

    static TABS = { archivist: { navSelector: '.archivist-nav', contentSelector: '.archivist-content', initial: 'info' } };

    _initializeApplicationOptions(options) {
        const o = super._initializeApplicationOptions?.(options) ?? options ?? {};
        // Ensure each instance renders to a unique element id without touching this.document too early
        let uid = null;
        try {
            uid = this.document?.uuid || this.document?.id || null;
        } catch (_) {
            uid = null;
        }
        // Fallback to any document passed via options (if present) or a random id
        uid = uid || options?.document?.uuid || options?.document?.id || o.uniqueId || foundry.utils.randomID();
        o.uniqueId = uid;
        return o;
    }

    async _prepareContext(_options) {
        console.log('[Archivist V2 Sheet] _prepareContext START', { editMode: this._editMode, editingInfo: this._editingInfo });
        const entry = this.document;
        const flags = entry?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
        const sheetType = String(flags.sheetType || 'entry');
        const pages = entry?.pages?.contents || [];
        const page = pages.find(p => {
            const pFlags = p.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
            return pFlags.sheetType === sheetType;
        }) || pages.find(p => p.type === 'text') || pages[0];
        const name = entry?.name || page?.name || '';
        let image = String(entry?.img || '').trim();
        try {
            const f = entry?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
            const st = String(f.sheetType || '').toLowerCase();
            // Prefer explicit archivist image flag if present
            if (!image) {
                const flagImg = String(f.image || '').trim();
                if (flagImg) image = flagImg;
            }
            if (!image && (st === 'pc' || st === 'npc' || st === 'character')) {
                const actorId = (f.foundryRefs?.actors || [])[0];
                const actor = actorId ? game.actors?.get?.(actorId) : null;
                if (actor?.img) image = String(actor.img).trim();
            } else if (!image && st === 'item') {
                const itemId = (f.foundryRefs?.items || [])[0];
                const itm = itemId ? game.items?.get?.(itemId) : null;
                if (itm?.img) image = String(itm.img).trim();
            } else if (!image && st === 'location') {
                const sceneId = (f.foundryRefs?.scenes || [])[0];
                const scene = sceneId ? game.scenes?.get?.(sceneId) : null;
                const sc = scene?.thumbnail || scene?.img || '';
                if (sc) image = String(sc).trim();
            }
            // Fallback: Archivist Hub image flag if journal.img is empty
            if (!image) {
                const ccImg = String(entry?.getFlag?.('archivist-hub', 'image') || '').trim();
                if (ccImg) image = ccImg;
            }
            // Final fallback: Foundry default icons per sheet type
            if (!image) {
                if (st === 'pc' || st === 'npc' || st === 'character') image = 'icons/svg/mystery-man.svg';
                else if (st === 'item') image = 'icons/svg/item-bag.svg';
                else if (st === 'location') image = 'icons/svg/mountain.svg';
                else if (st === 'faction') image = 'icons/svg/village.svg';
            }
        } catch (_) { }
        const htmlContent = this._getInfoHtml(page);
        const rawContent = page?.text?.content || '';
        const pageUuid = page?.uuid || '';
        const gmNotes = String(flags.gmNotes || '').trim();
        const isGM = game.user?.isGM || false;
        // Edit mode controls whether info/title are editable
        this._editingInfo = !!this._editMode;
        // Recap/session date support
        let sessionDate = '';
        let sessionDateFormatted = '';
        let sessionDateInput = '';
        try {
            const pFlags = page?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
            const eFlags = entry?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
            sessionDate = String(pFlags || eFlags || '').trim();
            if (sessionDate) {
                // Use yyyy-MM-dd for <input type="date">
                sessionDateInput = sessionDate.slice(0, 10);
                // Format for display (matching Archivist Hub format)
                try {
                    const d = new Date(sessionDate);
                    if (!isNaN(d.getTime())) {
                        sessionDateFormatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }
                } catch (_) { }
            }
        } catch (_) { }
        const result = { setup: { sheetType, name, image, editingInfo: !!this._editingInfo, pageUuid, rawContent, gmNotes, isGM, sessionDate: sessionDateFormatted, sessionDateInput }, htmlContent };
        console.log('[Archivist V2 Sheet] _prepareContext END', { editMode: this._editMode, editingInfo: result.setup.editingInfo, sheetType: result.setup.sheetType });
        return result;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        try {
            const root = this.element;
            const content = root.querySelector('.archivist-content') || root;
            const isGM = !!game.user?.isGM;
            if (isGM) {
                content.classList.add('archivist-dropzone');
                content.addEventListener('drop', ev => this._onArchivistDrop(ev));
                content.addEventListener('dragover', ev => ev.preventDefault());
            }

            // Hide GM Notes tab from non-GMs
            if (!game.user?.isGM) {
                const notesTabLink = root.querySelector('.archivist-nav .item[data-tab="notes"]');
                if (notesTabLink) notesTabLink.style.display = 'none';
            }

            // When in edit mode, ensure ProseMirror editors are toggled on and hide their own Save buttons
            try {
                if (this._editingInfo) {
                    root.querySelectorAll('prose-mirror').forEach(pm => {
                        try {
                            if (!pm.hasAttribute('toggled')) pm.setAttribute('toggled', '');
                            // Nudge activation: simulate a click/focus after render
                            setTimeout(() => {
                                try { pm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (_) { }
                                try { pm.focus?.(); } catch (_) { }
                            }, 0);
                        } catch (_) { }
                    });
                    // Hide per-editor save buttons to avoid UX confusion
                    root.querySelectorAll('.pm-menu [data-action="save"], .prosemirror [data-action="save"], .ProseMirror-menu [data-action="save"]').forEach(btn => {
                        btn.style.display = 'none';
                    });
                }
            } catch (_) { }

            // In-sheet Edit Mode toggle (GM-only)
            if (game.user?.isGM) {
                try {
                    const toggleBtn = root.querySelector('[data-action="toggle-edit-mode"]');
                    console.log('[Archivist V2 Sheet] Edit toggle button found:', !!toggleBtn);
                    if (toggleBtn && !toggleBtn.dataset.bound) {
                        toggleBtn.addEventListener('click', ev => {
                            console.log('[Archivist V2 Sheet] Edit toggle button CLICKED');
                            ev.preventDefault();
                            ev.stopPropagation();
                            this._toggleEditMode();
                        });
                        toggleBtn.dataset.bound = 'true';
                        console.log('[Archivist V2 Sheet] Edit toggle button listener bound');
                    }
                } catch (_) { }
            }

            // Ensure tabs toggle
            try {
                const nav = root.querySelector('.archivist-nav');
                const tabs = root.querySelectorAll('.archivist-content .tab');
                const setActive = (id) => {
                    root.querySelectorAll('.archivist-nav .item').forEach(a => a.classList.toggle('active', a.dataset.tab === id));
                    tabs.forEach(s => s.classList.toggle('active', s.dataset.tab === id));
                };
                // Prefer last known active tab; fall back to any pre-marked active or 'info'
                const initialTab = this._activeTab || nav?.querySelector('.item.active')?.dataset.tab || 'info';
                setActive(initialTab);
                nav?.addEventListener('click', ev => {
                    const a = ev.target?.closest?.('.item[data-tab]');
                    if (!a) return;
                    ev.preventDefault();
                    this._activeTab = a.dataset.tab || 'info';
                    setActive(this._activeTab);
                });
            } catch (_) { }

            // Card click handler - open linked sheet
            root.addEventListener('click', ev => {
                const card = ev.target?.closest?.('.archivist-card');
                if (!card) return;
                // Don't trigger if clicking on an action button
                if (ev.target?.closest?.('.actions')) return;
                ev.stopPropagation();
                ev.stopImmediatePropagation?.();
                ev.preventDefault();
                const aid = card.dataset.archivistId;
                if (!aid) return;
                const target = this._findPageOrEntryByArchivistId(aid);
                if (target) {
                    const entry = target.documentName === 'JournalEntryPage' ? target.parent : target;
                    entry?.sheet?.render?.({ force: true }).then(app => app?.bringToFront?.());
                }
            });

            // Handle GM Notes ProseMirror save events
            try {
                const gmNotesEditor = root.querySelector('prose-mirror[name="gmNotes"]');
                if (gmNotesEditor && game.user?.isGM) {
                    if (gmNotesEditor.dataset.bound) return;
                    gmNotesEditor.addEventListener('save', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation?.();
                        try {
                            const value = Array.isArray(gmNotesEditor.value) ? gmNotesEditor.value[0] : gmNotesEditor.value;
                            const flags = this._getArchivistFlags();
                            flags.gmNotes = value || '';
                            await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                            ui.notifications?.info?.('GM notes saved');
                        } catch (e) {
                            console.warn('[Archivist Sync][V2] Save GM notes failed', e);
                        }
                    });
                    gmNotesEditor.dataset.bound = 'true';
                }
            } catch (e) {
                console.warn('[Archivist Sync][V2] GM notes editor init failed', e);
            }

            // Unlink handler (GM-only)
            root.addEventListener('click', async ev => {
                const btn = ev.target?.closest?.('[data-action="unlink"]');
                if (!btn) return;
                if (!game.user?.isGM) return;
                ev.preventDefault();
                ev.stopPropagation(); // Prevent card click
                const bucket = btn.dataset.bucket;
                const aid = btn.dataset.archivistId || '';
                if (!bucket || !aid) return;
                const target = this._findPageOrEntryByArchivistId(aid);
                try {
                    if (target) {
                        await unlinkDocs(this.document, target, bucket);
                        try { await this._renderLinkedGrids(); } catch (_) { }
                    } else {
                        const flags = this._getArchivistFlags();
                        const arr = (flags.archivistRefs && flags.archivistRefs[bucket]) || [];
                        const next = arr.filter(x => x !== aid);
                        flags.archivistRefs = flags.archivistRefs || {};
                        flags.archivistRefs[bucket] = next;
                        await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                        Hooks.callAll('ArchivistLinksUpdated', { ids: [this.document.id], bucket });
                        try { await this._renderLinkedGrids(); } catch (_) { }
                    }
                    // After local unlink, also delete remote link(s) in Archivist
                    try {
                        const apiKey = settingsManager.getApiKey?.();
                        const campaignId = settingsManager.getSelectedWorldId?.();
                        const fromFlags = this._getArchivistFlags();
                        const fromId = String(fromFlags.archivistId || this.document.id || '');
                        if (apiKey && campaignId && fromId && aid) {
                            const list = await archivistApi.listLinksByFromId(apiKey, campaignId, fromId);
                            const links = list?.success ? (list.data || []) : [];
                            const toDelete = links.filter(l => String(l?.to_id || l?.toId || '') === String(aid));
                            for (const L of toDelete) {
                                const linkId = L?.id || L?._id || L?.link_id || L?.linkId;
                                if (!linkId) continue;
                                await archivistApi.deleteLink(apiKey, campaignId, String(linkId));
                            }
                        }
                    } catch (_) { }
                } catch (e) {
                    console.warn('[Archivist Sync][PageV2] unlink failed', e);
                }
            });

            // Journals tab: unlink local Foundry journals (supports entry id or page UUID)
            root.addEventListener('click', async ev => {
                try {
                    const unlinkBtn = ev.target?.closest?.('[data-action="unlink-foundry-journal"]');
                    if (unlinkBtn) {
                        if (!game.user?.isGM) return;
                        ev.preventDefault();
                        ev.stopPropagation();
                        const ref = unlinkBtn.dataset.journalRef || unlinkBtn.dataset.journalId;
                        if (!ref) return;
                        const flags = this._getArchivistFlags();
                        const next = { ...(flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] }) };
                        next.journals = (Array.isArray(next.journals) ? next.journals : []).filter(x => String(x) !== String(ref));
                        await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', { ...flags, foundryRefs: next });
                        try { await this._renderLinkedGrids(); } catch (_) { }
                        return;
                    }
                } catch (_) { }
            });

            // Place on scene handler (for PC/NPC sheets)
            root.addEventListener('click', async ev => {
                const btn = ev.target?.closest?.('[data-action="place-on-scene"]');
                if (!btn) return;
                if (!game.user?.isGM) return;
                ev.preventDefault();

                // Ensure an active scene is available
                const scene = game.scenes?.active;
                if (!scene) {
                    ui.notifications?.warn('No active scene found. Please activate a scene first.');
                    return;
                }

                // Get the linked actor for this character
                const flags = this._getArchivistFlags();
                const actorId = (flags.foundryRefs?.actors || [])[0];
                const actor = actorId ? game.actors?.get?.(actorId) : null;

                if (!actor) {
                    ui.notifications?.error('No linked actor found for this character.');
                    return;
                }

                try {
                    // Get token data from the actor
                    const tokenData = await actor.getTokenDocument();

                    // Find a suitable position on the scene (center of current view or scene center)
                    const viewPos = canvas?.scene?.id === scene.id ? {
                        x: canvas.stage?.pivot?.x || (scene.width / 2),
                        y: canvas.stage?.pivot?.y || (scene.height / 2)
                    } : {
                        x: scene.width / 2,
                        y: scene.height / 2
                    };

                    // Create the token on the scene
                    const [token] = await scene.createEmbeddedDocuments('Token', [{
                        ...tokenData.toObject(),
                        x: viewPos.x - (tokenData.width * scene.grid.size / 2),
                        y: viewPos.y - (tokenData.height * scene.grid.size / 2)
                    }]);

                    ui.notifications?.info(`${actor.name} has been placed on the scene.`);

                    // Optionally pan to the token if on the active scene
                    if (canvas?.scene?.id === scene.id && token) {
                        canvas.animatePan({ x: token.x, y: token.y, duration: 250 });
                    }
                } catch (e) {
                    console.error('[Archivist Sync][PageV2] place-on-scene failed', e);
                    ui.notifications?.error('Failed to place token on scene.');
                }
            });


            // No dblclick toggle while editing; editor is enabled by default

            // ProseMirror save handling for Info editors
            try {
                root.querySelectorAll('prose-mirror').forEach(editor => {
                    if (editor.dataset.bound) return;
                    if (!game.user?.isGM) {
                        editor.setAttribute('disabled', 'true');
                        editor.contentEditable = 'false';
                        return;
                    }
                    editor.addEventListener('save', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation?.();
                        try {
                            const entry = this.document;
                            const pages = entry?.pages?.contents || [];
                            const page = pages.find(p => p.type === 'text') || pages[0];
                            if (!page) return;
                            const value = Array.isArray(editor.value) ? editor.value[0] : editor.value;
                            const fmt = Number(page?.text?.format ?? 0);
                            if (fmt === 2) {
                                const md = Utils.toMarkdownIfHtml(String(value || ''));
                                await page.update({ 'text.markdown': md, 'text.format': 2 });
                            } else {
                                const html = String(value || '');
                                await page.update({ 'text.content': html, 'text.format': 1 });
                            }
                            // keep editor open by default
                            this.render(false);
                        } catch (e) {
                            console.warn('[Archivist Sync][PageV2] ProseMirror save failed', e);
                        }
                    });
                    editor.dataset.bound = 'true';
                });
            } catch (_) { }

            // Character/Item: specific drop targets for linking Foundry Actor/Item
            try {
                const actorTarget = root.querySelector('[data-drop="actor"]');
                if (actorTarget) {
                    if (!game.user?.isGM) {
                        actorTarget.style.pointerEvents = 'none';
                    } else {
                        actorTarget.addEventListener('dragover', ev => ev.preventDefault());
                        actorTarget.addEventListener('drop', async ev => {
                            ev.preventDefault();
                            try {
                                const dataStr = ev.dataTransfer?.getData('text/plain') || '';
                                const data = dataStr ? JSON.parse(dataStr) : null;
                                const uuid = data?.uuid || data?.data?.uuid || data?.text;
                                const doc = uuid ? await fromUuid(uuid) : null;
                                if (doc?.documentName !== 'Actor') return;
                                const flags = this._getArchivistFlags();
                                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                                flags.foundryRefs.actors = [doc.id];
                                await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                                ui.notifications?.info?.('Linked actor to character');
                                this.render(false);
                            } catch (e) {
                                console.warn('[Archivist Sync][V2] Actor drop failed', e);
                            }
                        });
                    }
                }

                const itemTarget = root.querySelector('[data-drop="item"]');
                if (itemTarget) {
                    if (!game.user?.isGM) {
                        itemTarget.style.pointerEvents = 'none';
                    } else {
                        itemTarget.addEventListener('dragover', ev => ev.preventDefault());
                        itemTarget.addEventListener('drop', async ev => {
                            ev.preventDefault();
                            try {
                                const dataStr = ev.dataTransfer?.getData('text/plain') || '';
                                const data = dataStr ? JSON.parse(dataStr) : null;
                                const uuid = data?.uuid || data?.data?.uuid || data?.text;
                                const doc = uuid ? await fromUuid(uuid) : null;
                                if (doc?.documentName !== 'Item') return;
                                const flags = this._getArchivistFlags();
                                flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                                flags.foundryRefs.items = [doc.id];
                                await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                                ui.notifications?.info?.('Linked item to sheet');
                                this.render(false);
                            } catch (e) {
                                console.warn('[Archivist Sync][V2] Item drop failed', e);
                            }
                        });
                    }
                }
            } catch (_) { }
        } catch (e) {
            console.warn('[Archivist Sync][PageV2] _onRender failed', e);
        }
        try {
            if (typeof this._renderLinkedGrids === 'function') this._renderLinkedGrids();
            if (typeof this._renderActorItemCards === 'function') this._renderActorItemCards();
        } catch (_) { }
    }


    async _toggleEditMode() {
        console.log('[Archivist V2 Sheet] _toggleEditMode called, current editMode:', this._editMode);
        if (!this._editMode) {
            // Enter edit mode: suppress realtime API writes until commit
            console.log('[Archivist V2 Sheet] Entering edit mode...');
            try { settingsManager.suppressRealtimeSync?.(); } catch (_) { }
            this._editMode = true;
            this._editingInfo = true;
            console.log('[Archivist V2 Sheet] Edit mode enabled, calling render...');
            await this.render({ force: true });
            console.log('[Archivist V2 Sheet] Render complete (edit mode ON)');
            return;
        }
        // Leaving edit mode: commit local + remote changes
        try {
            console.log('[Archivist V2 Sheet] Leaving edit mode, committing...');
            await this._commitEdits();
            console.log('[Archivist V2 Sheet] Commit complete');
        } catch (e) {
            console.warn('[Archivist Sync][V2] commit: failed', e);
        } finally {
            this._editMode = false;
            this._editingInfo = false;
            console.log('[Archivist V2 Sheet] Edit mode disabled, calling render...');
            try { settingsManager.resumeRealtimeSync?.(); } catch (_) { }
            await this.render({ force: true });
            console.log('[Archivist V2 Sheet] Render complete (edit mode OFF)');
        }
    }

    /**
     * Persist edits made while in edit mode and PATCH Archivist API.
     */
    async _commitEdits() {
        console.log('[Archivist V2 Sheet] _commitEdits START');
        const entry = this.document;
        if (!entry) return;
        const flags = this._getArchivistFlags();
        const sheetType = String(flags.sheetType || 'entry').toLowerCase();
        const apiKey = settingsManager.getApiKey?.();
        const campaignId = settingsManager.getSelectedWorldId?.();
        const archivistId = String(flags.archivistId || '');

        // Read title input (if present) and update local document
        try {
            const titleInput = this.element?.querySelector?.('.archivist-title-input');
            console.log('[Archivist V2 Sheet] Title input found:', !!titleInput, titleInput?.value);
            if (titleInput) {
                const next = String(titleInput.value || '').trim();
                if (next && next !== entry.name) {
                    console.log('[Archivist V2 Sheet] Updating title:', next);
                    await entry.update({ name: next });
                }
            }
        } catch (_) { }

        // Resolve the primary text page for the Info tab
        const pages = entry?.pages?.contents || [];
        const infoPage = pages.find(p => {
            try {
                const pFlags = p.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                return pFlags.sheetType === (flags.sheetType || 'entry');
            } catch (_) { return false; }
        }) || pages.find(p => p.type === 'text') || pages[0] || null;

        // Pull current editor content (unsaved) and update local page
        let html = '';
        try {
            const root = this.element;
            const textarea = root?.querySelector?.('textarea.archivist-info-textarea');
            if (textarea) {
                html = String(textarea.value || '');
                console.log('[Archivist V2 Sheet] Textarea content length:', html.length);
            } else {
                const editor = root?.querySelector?.('section.tab[data-tab="info"] prose-mirror');
                console.log('[Archivist V2 Sheet] ProseMirror editor found:', !!editor);
                if (editor) {
                    const value = Array.isArray(editor.value) ? editor.value[0] : editor.value;
                    html = String(value || '');
                    console.log('[Archivist V2 Sheet] Editor content length:', html.length);
                }
            }
            if (infoPage) {
                const fmt = Number(infoPage?.text?.format ?? 0);
                console.log('[Archivist V2 Sheet] Updating page content');
                if (fmt === 2) {
                    const md = Utils.toMarkdownIfHtml(String(html || ''));
                    await infoPage.update({ 'text.markdown': md, 'text.format': 2 });
                } else {
                    await infoPage.update({ 'text.content': String(html || ''), 'text.format': 1 });
                }
            }
        } catch (e) {
            console.warn('[Archivist Sync][V2] commit: failed updating page content', e);
        }

        // Recap session date input handling (also usable as plain string input)
        let sessionDate = '';
        if (sheetType === 'recap' || sheetType === 'session') {
            try {
                const dateEl = this.element?.querySelector?.('.recap-date-input');
                console.log('[Archivist V2 Sheet] Recap date input found:', !!dateEl, dateEl?.value);
                if (dateEl) sessionDate = String(dateEl.value || '').trim();
                if (sessionDate) {
                    // Recombine with original time part if present
                    let originalIso = '';
                    try {
                        const pFlags = infoPage?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
                        const eFlags = entry?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
                        originalIso = String(pFlags || eFlags || '').trim();
                    } catch (_) { }
                    const originalTime = originalIso.includes('T') ? originalIso.split('T')[1] : '00:00:00';
                    const recombined = `${sessionDate}T${originalTime}`;
                    // Write both page and entry flags for robustness
                    try { await infoPage?.setFlag?.(CONFIG.MODULE_ID, 'sessionDate', recombined); } catch (_) { }
                    try { await entry?.setFlag?.(CONFIG.MODULE_ID, 'sessionDate', recombined); } catch (_) { }
                }
            } catch (_) { }
        }

        // Remote PATCH on toggle-off (if configured and id present)
        try {
            console.log('[Archivist V2 Sheet] Remote sync check:', { apiKey: !!apiKey, campaignId: !!campaignId, archivistId: !!archivistId, sheetType });
            if (!apiKey || !campaignId || !archivistId) return;
            const nameNow = entry.name;
            let result;
            if (sheetType === 'pc' || sheetType === 'npc' || sheetType === 'character') {
                console.log('[Archivist V2 Sheet] Syncing Character to API');
                result = await archivistApi.updateCharacter(apiKey, archivistId, {
                    character_name: nameNow,
                    description: html || undefined
                });
                if (!result.success && result.isDescriptionTooLong) {
                    ui.notifications?.error?.(
                        `Failed to save ${result.entityName || nameNow}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
                        { permanent: true }
                    );
                    return;
                }
            } else if (sheetType === 'item') {
                console.log('[Archivist V2 Sheet] Syncing Item to API');
                result = await archivistApi.updateItem(apiKey, archivistId, {
                    name: nameNow,
                    description: html || undefined
                });
                if (!result.success && result.isDescriptionTooLong) {
                    ui.notifications?.error?.(
                        `Failed to save ${result.entityName || nameNow}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
                        { permanent: true }
                    );
                    return;
                }
            } else if (sheetType === 'location') {
                console.log('[Archivist V2 Sheet] Syncing Location to API');
                result = await archivistApi.updateLocation(apiKey, archivistId, {
                    name: nameNow,
                    description: html || undefined
                });
                if (!result.success && result.isDescriptionTooLong) {
                    ui.notifications?.error?.(
                        `Failed to save ${result.entityName || nameNow}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
                        { permanent: true }
                    );
                    return;
                }
            } else if (sheetType === 'faction') {
                console.log('[Archivist V2 Sheet] Syncing Faction to API');
                result = await archivistApi.updateFaction(apiKey, archivistId, {
                    name: nameNow,
                    description: html || undefined
                });
                if (!result.success && result.isDescriptionTooLong) {
                    ui.notifications?.error?.(
                        `Failed to save ${result.entityName || nameNow}: Description exceeds the maximum length of 10,000 characters. Please shorten the description and try again.`,
                        { permanent: true }
                    );
                    return;
                }
            } else if (sheetType === 'recap' || sheetType === 'session') {
                console.log('[Archivist V2 Sheet] Syncing Recap/Session to API');
                const summary = html || '';
                const payload = { title: nameNow, summary };
                if (sessionDate) {
                    // Send full ISO (with time) using flags value if available
                    let fullIso = '';
                    try {
                        const pFlags = infoPage?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
                        const eFlags = entry?.getFlag?.(CONFIG.MODULE_ID, 'sessionDate') || '';
                        fullIso = String(pFlags || eFlags || '').trim();
                    } catch (_) { }
                    payload.session_date = fullIso || `${sessionDate}T00:00:00`;
                }
                await archivistApi.updateSession(apiKey, archivistId, payload);
            }
        } catch (e) {
            console.warn('[Archivist Sync][V2] commit: remote sync failed', e);
        }
        console.log('[Archivist V2 Sheet] _commitEdits END');
    }

    async _onArchivistDrop(event) {
        event.preventDefault();
        try {
            const dataStr = event.dataTransfer?.getData('text/plain') || '';
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            const uuid = data?.uuid || data?.data?.uuid || data?.text;
            if (!uuid) return;
            const dropped = await fromUuid(uuid);
            if (!dropped) return;

            // Ignore Recap sheets (Sessions) for generic linking
            const droppedFlags = (dropped?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || (dropped?.parent?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || {};
            const droppedType = String(droppedFlags.sheetType || '').toLowerCase();
            if (droppedType === 'recap' || droppedType === 'session') return;

            const targetFlags = this._getArchivistFlags();
            const targetType = String(targetFlags.sheetType || '').toLowerCase();
            if (targetType === 'recap' || targetType === 'session') return;

            const bucket = this._bucketForDrop(dropped);
            if (!bucket) return;

            if (dropped.documentName === 'Actor' || dropped.documentName === 'Item') {
                const flags = this._getArchivistFlags();
                flags.archivistRefs = flags.archivistRefs || { characters: [], items: [], entries: [], factions: [], locationsAssociative: [] };
                const aid = dropped.getFlag(CONFIG.MODULE_ID, 'archivistId');
                if (!aid) return;
                const arr = Array.isArray(flags.archivistRefs[bucket]) ? flags.archivistRefs[bucket] : [];
                if (!arr.includes(aid)) arr.push(aid);
                flags.archivistRefs[bucket] = arr;
                await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
            } else {
                // Prepare the target and dropped docs as JournalEntry-level documents
                const toDoc = (dropped?.documentName === 'JournalEntryPage') ? dropped.parent : (dropped?.documentName === 'JournalEntry' ? dropped : null);
                if (!toDoc) return;

                // If the dropped Journal is NOT an Archivist custom sheet, store a local Foundry link only
                try {
                    const toFlags = (toDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || {};
                    const isArchivistSheet = !!toFlags.sheetType;
                    if (!isArchivistSheet) {
                        const flags = this._getArchivistFlags();
                        flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                        const arr = Array.isArray(flags.foundryRefs.journals) ? flags.foundryRefs.journals.slice() : [];
                        // Support storing JournalEntryPage UUIDs for page drops; otherwise store JournalEntry id
                        const linkKey = (dropped?.documentName === 'JournalEntryPage') ? String(dropped.uuid) : String(toDoc.id);
                        if (!arr.includes(linkKey)) arr.push(linkKey);
                        flags.foundryRefs.journals = arr;
                        await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                        try { await this._renderLinkedGrids(); } catch (_) { }
                        return; // Do not create Archivist API links for local Foundry journals
                    }
                } catch (_) { }

                // Local link first
                await linkDocs(this.document, toDoc, bucket);
                // Partially refresh linked grids only; preserve active tab
                try { await this._renderLinkedGrids(); } catch (_) { }

                // Then POST to Archivist API to persist the link using archivist IDs and canonical types
                try {
                    const apiKey = settingsManager.getApiKey?.();
                    const campaignId = settingsManager.getSelectedWorldId?.();
                    const toFlags = (toDoc?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || {};
                    const toId = String(toFlags.archivistId || '');
                    const fromId = String(targetFlags.archivistId || '');
                    if (apiKey && campaignId && toId && fromId) {
                        const resolveType = (flags) => {
                            const st = String(flags.sheetType || '').toLowerCase();
                            if (st === 'character' || st === 'pc' || st === 'npc') return 'Character';
                            if (st === 'item') return 'Item';
                            if (st === 'location') return 'Location';
                            if (st === 'faction') return 'Faction';
                            return 'Entry';
                        };
                        const toType = resolveType(toFlags);
                        const fromType = resolveType(targetFlags);
                        // Alias is the dropped sheet name
                        const alias = String(toDoc?.name || '').trim();
                        await archivistApi.createLink(apiKey, campaignId, {
                            to_id: toId,
                            to_type: toType,
                            from_id: fromId,
                            from_type: fromType,
                            alias,
                            campaign_id: campaignId,
                        });
                    }
                } catch (_) { }
            }
        } catch (e) {
            console.warn('[Archivist Sync][PageV2] Drop failed', e);
        }
    }

    _bucketForDrop(doc) {
        const flags = this._getArchivistFlags();
        const sheetType = flags.sheetType || 'entry';
        const docName = doc?.documentName || doc?.constructor?.name || '';
        if (docName === 'Actor') return 'characters';
        if (docName === 'Item') return 'items';
        if (docName === 'JournalEntry' || docName === 'JournalEntryPage') {
            const dFlags = (doc?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || (doc?.parent?.getFlag?.(CONFIG.MODULE_ID, 'archivist')) || {};
            const dType = String(dFlags.sheetType || '').toLowerCase();
            if (dType === 'character' || dType === 'pc' || dType === 'npc') return 'characters';
            if (dType === 'item') return 'items';
            if (dType === 'faction') return 'factions';
            if (dType === 'location') return 'locationsAssociative';
            return 'entries';
        }
        return null;
    }

    _docForLink(doc) {
        if (doc?.documentName === 'JournalEntryPage') return doc;
        if (doc?.documentName === 'JournalEntry') {
            const pages = doc.pages?.contents || [];
            return pages.find(p => p.type === 'text') || doc;
        }
        return this.document;
    }

    _getArchivistFlags() {
        return this.document?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
    }

    _getInfoHtml(page) {
        try {
            if (page?.type === 'text') {
                const fmt = Number(page?.text?.format ?? 0);
                const md = page?.text?.markdown;
                const content = page?.text?.content;
                console.log(`[Sheet] _getInfoHtml (page):`, {
                    journalName: this.document?.name,
                    format: fmt,
                    markdownLength: md?.length || 0,
                    contentLength: content?.length || 0,
                    markdownPreview: (md || '').substring(0, 100),
                });
                if (fmt === 2 && typeof md === 'string') {
                    // Convert Markdown to HTML for display
                    const html = Utils.markdownToStoredHtml(md);
                    console.log(`[Sheet] Converted markdown to HTML, length:`, html.length);
                    return html;
                }
                return String(content || md || '');
            }
            const entry = this.document;
            const pages = entry?.pages?.contents || [];
            const p = pages.find(x => x.type === 'text');
            if (p) {
                const fmt = Number(p?.text?.format ?? 0);
                const md = p?.text?.markdown;
                const content = p?.text?.content;
                console.log(`[Sheet] _getInfoHtml (fallback):`, {
                    journalName: entry?.name,
                    format: fmt,
                    markdownLength: md?.length || 0,
                    contentLength: content?.length || 0,
                    markdownPreview: (md || '').substring(0, 100),
                });
                if (fmt === 2 && typeof md === 'string') {
                    // Convert Markdown to HTML for display
                    const html = Utils.markdownToStoredHtml(md);
                    console.log(`[Sheet] Converted markdown to HTML, length:`, html.length);
                    return html;
                }
                return String(content || md || '');
            }
        } catch (e) {
            console.error('[Sheet] _getInfoHtml error:', e);
        }
        return '';
    }

    /**
     * Resolve the best-available image for a custom sheet document (JournalEntry or Page),
     * following the same fallback chain as the header avatar.
     */
    _resolveSheetImage(doc) {
        try {
            const entry = (doc?.documentName === 'JournalEntryPage') ? doc.parent : (doc?.documentName === 'JournalEntry' ? doc : null);
            if (!entry) return '';
            let image = String(entry?.img || '').trim();
            const f = entry?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {};
            const st = String(f.sheetType || '').toLowerCase();
            if (!image) {
                const flagImg = String(f.image || '').trim();
                if (flagImg) image = flagImg;
            }
            if (!image) {
                if (st === 'pc' || st === 'npc' || st === 'character') {
                    const actorId = (f.foundryRefs?.actors || [])[0];
                    const actor = actorId ? game.actors?.get?.(actorId) : null;
                    if (actor?.img) image = String(actor.img).trim();
                } else if (st === 'item') {
                    const itemId = (f.foundryRefs?.items || [])[0];
                    const itm = itemId ? game.items?.get?.(itemId) : null;
                    if (itm?.img) image = String(itm.img).trim();
                } else if (st === 'location') {
                    const sceneId = (f.foundryRefs?.scenes || [])[0];
                    const scene = sceneId ? game.scenes?.get?.(sceneId) : null;
                    const sc = scene?.thumbnail || scene?.img || '';
                    if (sc) image = String(sc).trim();
                }
            }
            if (!image) {
                const ccImg = String(entry?.getFlag?.('archivist-hub', 'image') || '').trim();
                if (ccImg) image = ccImg;
            }
            if (!image) {
                if (st === 'pc' || st === 'npc' || st === 'character') return 'icons/svg/mystery-man.svg';
                if (st === 'item') return 'icons/svg/item-bag.svg';
                if (st === 'location') return 'icons/svg/mountain.svg';
                if (st === 'faction') return 'icons/svg/village.svg';
            }
            return image;
        } catch (_) { return ''; }
    }

    async _renderLinkedGrids() {
        try {
            const root = this.element;
            // Render sequencing guard to prevent interleaved duplicate appends
            const __seq = (this._lgSeq = (this._lgSeq || 0) + 1);
            const isCurrent = () => this._lgSeq === __seq;
            const uniq = (arr) => Array.from(new Set((arr || []).map(String)));
            const flags = this._getArchivistFlags();
            const refs = flags.archivistRefs || {};
            const byId = id => this._findPageOrEntryByArchivistId(id);
            const byActorId = id => (game.actors?.contents || []).find(a => a.getFlag(CONFIG.MODULE_ID, 'archivistId') === id);
            const byItemId = id => (game.items?.contents || []).find(i => i.getFlag(CONFIG.MODULE_ID, 'archivistId') === id);

            const hideByOwnership = settingsManager.getHideByOwnership?.();
            const canSee = doc => !hideByOwnership || game.user?.isGM || doc?.testUserPermission?.(game.user, 'OBSERVED');

            const setCount = (tab, count) => {
                try {
                    const a = root.parentElement?.querySelector?.(`.archivist-nav [data-tab="${tab}"]`) || root.querySelector?.(`.archivist-nav [data-tab="${tab}"]`);
                    if (!a) return;
                    const base = a.dataset._label || a.textContent || tab;
                    if (!a.dataset._label) a.dataset._label = base;
                    a.textContent = count > 0 ? `${base} (${count})` : base;
                } catch (_) { }
            };

            // Characters panel (outbound only)
            const charactersEl = root.querySelector('.tab[data-tab="characters"] .archivist-grid');
            if (charactersEl) {
                charactersEl.innerHTML = '';
                let ids = [];
                try {
                    const { linkIndexer } = await import('../../modules/links/indexer.js');
                    if (!isCurrent()) return;
                    if (!linkIndexer._built) linkIndexer.buildFromWorld();
                    const myId = (this._getArchivistFlags().archivistId || this.document.id);
                    const out = linkIndexer.outboundByFromId.get(myId) || {};
                    ids = Array.isArray(out.characters) ? out.characters.slice() : [];
                    ids.sort();
                } catch (_) { ids = []; }
                if (!isCurrent()) return;
                for (const id of ids) {
                    const actor = byActorId(id);
                    const targetDoc = actor || byId(id);
                    if (targetDoc && !canSee(targetDoc)) continue;
                    const name = actor?.name || targetDoc?.name || `Character ${id}`;
                    const img = this._resolveSheetImage(targetDoc) || actor?.img || 'icons/svg/mystery-man.svg';
                    const el = document.createElement('div');
                    el.className = 'archivist-card';
                    el.dataset.archivistId = id;
                    el.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink" data-bucket="characters" data-archivist-id="${id}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    charactersEl.appendChild(el);
                }
                setCount('characters', charactersEl.children.length);
            }

            // PCs/NPCs split (outbound only)
            const pcsEl = root.querySelector('.tab[data-tab="pcs"] .archivist-grid, .tab[data-tab="pcs"] .pcs-grid');
            const npcsEl = root.querySelector('.tab[data-tab="npcs"] .archivist-grid, .tab[data-tab="npcs"] .npcs-grid');
            if (pcsEl || npcsEl) {
                let allCharIds = [];
                try {
                    const { linkIndexer } = await import('../../modules/links/indexer.js');
                    if (!isCurrent()) return;
                    if (!linkIndexer._built) linkIndexer.buildFromWorld();
                    const myId = (this._getArchivistFlags().archivistId || this.document.id);
                    const out = linkIndexer.outboundByFromId.get(myId) || {};
                    allCharIds = Array.isArray(out.characters) ? out.characters.slice() : [];
                } catch (_) { allCharIds = []; }
                if (!isCurrent()) return;
                allCharIds.sort();
                const classify = id => {
                    const target = byId(id);
                    const sheetType = String((target?.getFlag?.(CONFIG.MODULE_ID, 'archivist') || {}).sheetType || '').toLowerCase();
                    if (sheetType === 'pc' || sheetType === 'character') return 'pc';
                    if (sheetType === 'npc') return 'npc';
                    const actor = byActorId(id);
                    const t = String(actor?.type || '').toLowerCase();
                    if (t === 'character') return 'pc';
                    if (t === 'npc' || t === 'monster') return 'npc';
                    return 'pc';
                };
                if (pcsEl) pcsEl.innerHTML = '';
                if (npcsEl) npcsEl.innerHTML = '';
                for (const id of allCharIds) {
                    const bucket = classify(id);
                    const container = bucket === 'npc' ? npcsEl : pcsEl;
                    if (!container) continue;
                    const actor = byActorId(id);
                    const targetDoc = actor || byId(id);
                    if (targetDoc && !canSee(targetDoc)) continue;
                    const name = actor?.name || targetDoc?.name || `Character ${id}`;
                    const img = this._resolveSheetImage(targetDoc) || actor?.img || 'icons/svg/mystery-man.svg';
                    const el = document.createElement('div');
                    el.className = 'archivist-card';
                    el.dataset.archivistId = id;
                    el.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink" data-bucket="characters" data-archivist-id="${id}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    container.appendChild(el);
                }
                if (pcsEl) setCount('pcs', pcsEl.children.length);
                if (npcsEl) setCount('npcs', npcsEl.children.length);
            }

            // Factions (outbound only)
            const factionsEl = root.querySelector('.tab[data-tab="factions"] .archivist-grid, .factions-grid');
            if (factionsEl) {
                factionsEl.innerHTML = '';
                let ids = [];
                try {
                    const { linkIndexer } = await import('../../modules/links/indexer.js');
                    if (!isCurrent()) return;
                    if (!linkIndexer._built) linkIndexer.buildFromWorld();
                    const myId = (this._getArchivistFlags().archivistId || this.document.id);
                    const out = linkIndexer.outboundByFromId.get(myId) || {};
                    ids = Array.isArray(out.factions) ? out.factions.slice() : [];
                } catch (_) { ids = []; }
                if (!isCurrent()) return;
                ids.sort();
                for (const id of ids) {
                    const j = byId(id);
                    if (j && !canSee(j)) continue;
                    const name = j?.name || `Faction ${id}`;
                    const img = this._resolveSheetImage(j) || 'icons/svg/village.svg';
                    const el = document.createElement('div');
                    el.className = 'archivist-card';
                    el.dataset.archivistId = id;
                    el.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink" data-bucket="factions" data-archivist-id="${id}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    factionsEl.appendChild(el);
                }
                setCount('factions', factionsEl.children.length);
            }

            // Items grid (outbound only)
            const itemsEl = root.querySelector('.tab[data-tab="items"] .archivist-grid, .items-grid');
            if (itemsEl) {
                itemsEl.innerHTML = '';
                let ids = [];
                try {
                    const { linkIndexer } = await import('../../modules/links/indexer.js');
                    if (!isCurrent()) return;
                    if (!linkIndexer._built) linkIndexer.buildFromWorld();
                    const myId = (this._getArchivistFlags().archivistId || this.document.id);
                    const out = linkIndexer.outboundByFromId.get(myId) || {};
                    ids = Array.isArray(out.items) ? out.items.slice() : [];
                } catch (_) { ids = []; }
                if (!isCurrent()) return;
                ids.sort();
                for (const id of ids) {
                    const itm = byItemId(id);
                    if (itm && !canSee(itm)) continue;
                    const name = itm?.name || `Item ${id}`;
                    const targetDoc = byId(id);
                    const img = this._resolveSheetImage(targetDoc) || itm?.img || 'icons/svg/item-bag.svg';
                    const card = document.createElement('div');
                    card.className = 'archivist-card';
                    card.dataset.archivistId = id;
                    card.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink" data-bucket="items" data-archivist-id="${id}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    itemsEl.appendChild(card);
                }
                setCount('items', itemsEl.children.length);
            }

            // Journals grid
            const journalsGrid = root.querySelector('.tab[data-tab="journals"] .archivist-journals');
            if (journalsGrid) {
                journalsGrid.innerHTML = '';
                const f = this._getArchivistFlags();
                let jRefs = Array.isArray(f?.foundryRefs?.journals) ? f.foundryRefs.journals.slice() : [];
                jRefs = uniq(jRefs);
                jRefs.sort();
                const frag = document.createDocumentFragment();
                for (const ref of jRefs) {
                    // ref can be a JournalEntry id or a JournalEntryPage UUID
                    let j = null;
                    let page = null;
                    if (typeof ref === 'string' && ref.includes('JournalEntryPage.')) {
                        try { page = await fromUuid(ref); } catch (_) { page = null; }
                        j = page?.parent || null;
                    } else {
                        j = (game.journal?.contents || []).find(x => x.id === ref) || null;
                    }
                    if (j && !canSee(j)) continue;
                    const name = (page?.name || j?.name) || 'Journal';
                    const img = j?.img || 'icons/svg/book.svg';
                    const card = document.createElement('div');
                    card.className = 'archivist-card';
                    card.dataset.journalRef = String(ref);
                    card.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink-foundry-journal" data-journal-ref="${foundry.utils.escapeHTML(String(ref))}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    // Add click handler to open journal
                    if (j) {
                        card.addEventListener('click', ev => {
                            if (ev.target?.closest?.('.actions')) return;
                            ev.preventDefault();
                            // If a page ref is present, render and focus that page
                            const open = async () => {
                                await j.sheet?.render?.({ force: true });
                                try {
                                    if (page && j.sheet?.pages) {
                                        const found = j.sheet.pages.get?.(page.id) || null;
                                        // Best-effort: some systems/pages expose an activate/scroll method
                                        if (found?.activate) found.activate();
                                    }
                                } catch (_) { }
                                j.sheet?.bringToFront?.();
                            };
                            open();
                        });
                    }
                    frag.appendChild(card);
                }
                if (!isCurrent()) return;
                journalsGrid.innerHTML = '';
                journalsGrid.appendChild(frag);
                setCount('journals', journalsGrid.children.length);
            }

            // Locations associative grid (outbound only)
            const assocGrid = root.querySelector('.tab[data-tab="locations"] .archivist-grid, .locations-grid');
            if (assocGrid) {
                let ids = [];
                try {
                    const { linkIndexer } = await import('../../modules/links/indexer.js');
                    if (!linkIndexer._built) linkIndexer.buildFromWorld();
                    const myId = (this._getArchivistFlags().archivistId || this.document.id);
                    const out = linkIndexer.outboundByFromId.get(myId) || {};
                    ids = Array.isArray(out.locationsAssociative) ? out.locationsAssociative.slice() : [];
                } catch (_) { ids = []; }
                ids = uniq(ids);
                ids.sort();
                const frag = document.createDocumentFragment();
                for (const id of ids) {
                    const j = byId(id);
                    if (j && !canSee(j)) continue;
                    const name = (j?.name || j?.parent?.name) || `Location ${id}`;
                    const img = this._resolveSheetImage(j) || 'icons/svg/mountain.svg';
                    const el = document.createElement('div');
                    el.className = 'archivist-card';
                    el.dataset.archivistId = id;
                    el.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(name)}</span><div class="actions"><button type="button" data-action="unlink" data-bucket="locationsAssociative" data-archivist-id="${id}" title="Unlink"><i class="fas fa-unlink"></i></button></div>`;
                    frag.appendChild(el);
                }
                if (!isCurrent()) return;
                assocGrid.innerHTML = '';
                assocGrid.appendChild(frag);
                setCount('locations', assocGrid.children.length);
            }
        } catch (e) {
            console.warn('[Archivist Sync][PageV2] _renderLinkedGrids (Base) failed', e);
        }
    }

    async _renderActorItemCards() {
        try {
            const root = this.element;
            const flags = this._getArchivistFlags();
            // Linked Actor card (Character sheet)
            const actorWrap = root.querySelector('.linked-actor-card');
            if (actorWrap) {
                actorWrap.innerHTML = '';
                const actorId = (flags.foundryRefs?.actors || [])[0] || null;
                if (actorId) {
                    const actor = game.actors?.get?.(actorId) || null;
                    if (actor) {
                        const img = actor.img || 'icons/svg/mystery-man.svg';
                        const card = document.createElement('div');
                        card.className = 'mini-card';
                        card.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(actor.name)}</span><span class="actions"><button type="button" data-action="open-linked-actor" title="Open"><i class="fas fa-external-link-alt"></i></button><button type="button" data-action="unlink-linked-actor" title="Unlink"><i class="fas fa-unlink"></i></button></span>`;
                        actorWrap.appendChild(card);
                        const openBtn = card.querySelector('[data-action="open-linked-actor"]');
                        const unlinkBtn = card.querySelector('[data-action="unlink-linked-actor"]');
                        if (openBtn) openBtn.addEventListener('click', ev => { ev.preventDefault(); actor.sheet?.render?.(true); });
                        if (unlinkBtn) unlinkBtn.addEventListener('click', async ev => {
                            ev.preventDefault();
                            const next = { ...(flags.foundryRefs || {}) };
                            next.actors = [];
                            await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', { ...flags, foundryRefs: next });
                            this.render(false);
                        });
                    }
                }
            }

            // Linked Item card (Item sheet)
            const itemWrap = root.querySelector('.linked-item-card');
            if (itemWrap) {
                itemWrap.innerHTML = '';
                const itemId = (flags.foundryRefs?.items || [])[0] || null;
                if (itemId) {
                    const itm = game.items?.get?.(itemId) || null;
                    if (itm) {
                        const img = itm.img || 'icons/svg/item-bag.svg';
                        const card = document.createElement('div');
                        card.className = 'mini-card';
                        card.innerHTML = `<img src="${img}" alt=""/><span class="name">${foundry.utils.escapeHTML(itm.name)}</span><span class="actions"><button type="button" data-action="open-linked-item" title="Open"><i class="fas fa-external-link-alt"></i></button><button type="button" data-action="unlink-linked-item" title="Unlink"><i class="fas fa-unlink"></i></button></span>`;
                        itemWrap.appendChild(card);
                        const openBtn = card.querySelector('[data-action="open-linked-item"]');
                        const unlinkBtn = card.querySelector('[data-action="unlink-linked-item"]');
                        if (openBtn) openBtn.addEventListener('click', ev => { ev.preventDefault(); itm.sheet?.render?.(true); });
                        if (unlinkBtn) unlinkBtn.addEventListener('click', async ev => {
                            ev.preventDefault();
                            const next = { ...(flags.foundryRefs || {}) };
                            next.items = [];
                            await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', { ...flags, foundryRefs: next });
                            this.render(false);
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('[Archivist Sync][V2] _renderActorItemCards failed', e);
        }
    }

    _findPageOrEntryByArchivistId(id) {
        const journals = game.journal?.contents || [];
        for (const j of journals) {
            const pages = j.pages?.contents || [];
            for (const p of pages) {
                const pid = p.getFlag(CONFIG.MODULE_ID, 'archivistId');
                if (pid && pid === id) return p;
            }
        }
        return journals.find(j => (j.getFlag(CONFIG.MODULE_ID, 'archivist') || {}).archivistId === id) || null;
    }
}

export class EntryPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/entry.hbs' } }; }
export class PCPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/character.hbs' } }; }
export class NPCPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/character.hbs' } }; }
export class CharacterPageSheetV2 extends PCPageSheetV2 { }
export class ItemPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/item.hbs' } }; }

export class LocationPageSheetV2 extends ArchivistBasePageSheetV2 {
    static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/location.hbs' } };

    _onRender(context, options) {
        super._onRender(context, options);
        try {
            const root = this.element;
            // Tab toggling
            try {
                const nav = root.querySelector('.archivist-nav');
                const tabs = root.querySelectorAll('.archivist-content .tab');
                const setActive = (id) => {
                    root.querySelectorAll('.archivist-nav .item').forEach(a => a.classList.toggle('active', a.dataset.tab === id));
                    tabs.forEach(s => s.classList.toggle('active', s.dataset.tab === id));
                };
                const current = root.querySelector('.archivist-nav .item.active')?.dataset.tab || 'info';
                setActive(current);
                nav?.addEventListener('click', ev => {
                    const a = ev.target?.closest?.('.item[data-tab]');
                    if (!a) return;
                    ev.preventDefault();
                    setActive(a.dataset.tab);
                });
            } catch (_) { }

            // Scene drop target
            const sceneTarget = root.querySelector('[data-drop="scene"]');
            if (sceneTarget) {
                sceneTarget.addEventListener('dragover', ev => ev.preventDefault());
                sceneTarget.addEventListener('drop', async ev => {
                    ev.preventDefault();
                    try {
                        const dataStr = ev.dataTransfer?.getData('text/plain') || '';
                        const data = dataStr ? JSON.parse(dataStr) : null;
                        const uuid = data?.uuid || data?.data?.uuid || data?.text;
                        const doc = uuid ? await fromUuid(uuid) : null;
                        if (doc?.documentName !== 'Scene') return;
                        const flags = this._getArchivistFlags();
                        flags.foundryRefs = flags.foundryRefs || { actors: [], items: [], scenes: [], journals: [] };
                        flags.foundryRefs.scenes = [doc.id];
                        await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', flags);
                        ui.notifications?.info?.('Linked scene to location');
                    } catch (e) {
                        console.warn('[Archivist Sync][V2] Scene drop failed', e);
                    }
                });
            }

            // Parent drop target
            const parentTarget = root.querySelector('[data-drop="parent-location"]');
            if (parentTarget) {
                if (!game.user?.isGM) {
                    parentTarget.style.pointerEvents = 'none';
                } else {
                    parentTarget.addEventListener('dragover', ev => ev.preventDefault());
                    parentTarget.addEventListener('drop', async ev => {
                        ev.preventDefault();
                        try {
                            const dataStr = ev.dataTransfer?.getData('text/plain') || '';
                            const data = dataStr ? JSON.parse(dataStr) : null;
                            const uuid = data?.uuid || data?.data?.uuid || data?.text;
                            const doc = uuid ? await fromUuid(uuid) : null;
                            const entry = doc?.documentName === 'JournalEntryPage' ? doc.parent : doc;
                            if (entry?.documentName !== 'JournalEntry') return;
                            const f = entry.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                            if (f.sheetType !== 'location') return;
                            const parentKey = f.archivistId || entry.id;
                            const success = await setLocationParent(this.document, parentKey);
                            if (success) this.render(false);
                        } catch (e) {
                            console.warn('[Archivist Sync][V2] Parent drop failed', e);
                        }
                    });
                }
            }

            // Render tree and cards
            this._renderLocationTree();
            this._renderLocationCards();
            // Do not call _renderLinkedGrids() here; base _onRender already invoked it
        } catch (e) {
            console.warn('[Archivist Sync][V2] Location _onRender failed', e);
        }
    }

    async _renderLocationTree() {
        try {
            const root = this.element;
            const flags = this._getArchivistFlags();
            const myId = flags.archivistId || null;
            const ancEl = root.querySelector('.archivist-location-ancestors');
            const descWrap = root.querySelector('.archivist-location-descendants');
            if (!myId || (!ancEl && !descWrap)) return;
            const { linkIndexer } = await import('../../modules/links/indexer.js');
            if (!linkIndexer._built) linkIndexer.buildFromWorld();
            if (ancEl) {
                ancEl.innerHTML = '';
                const chain = linkIndexer.ancestorsByLocationId.get(myId) || [];
                const full = [...chain, myId];
                for (let i = 0; i < full.length; i++) {
                    const id = full[i];
                    const j = (game.journal?.contents || []).find(x => (x.getFlag(CONFIG.MODULE_ID, 'archivist') || {}).archivistId === id);
                    const a = document.createElement('a');
                    a.href = '#';
                    a.textContent = j?.name || 'Location';
                    a.addEventListener('click', ev => {
                        ev.stopPropagation();
                        ev.stopImmediatePropagation?.();
                        ev.preventDefault();
                        if (j) j.sheet?.render?.({ force: true }).then(app => app?.bringToFront?.());
                    });
                    ancEl.appendChild(a);
                    if (i < full.length - 1) ancEl.append(' › ');
                }
            }
            if (descWrap) {
                descWrap.innerHTML = '';
                const ul = document.createElement('ul');
                const renderChildren = (parentId, ulNode) => {
                    const kids = (linkIndexer.childrenByLocationId.get(parentId) || []).slice().sort();
                    for (const id of kids) {
                        const j = (game.journal?.contents || []).find(x => (x.getFlag(CONFIG.MODULE_ID, 'archivist') || {}).archivistId === id);
                        const li = document.createElement('li');
                        const a = document.createElement('a');
                        a.href = '#';
                        a.textContent = j?.name || 'Location';
                        a.addEventListener('click', ev => {
                            ev.stopPropagation();
                            ev.stopImmediatePropagation?.();
                            ev.preventDefault();
                            if (j) j.sheet?.render?.({ force: true }).then(app => app?.bringToFront?.());
                        });
                        li.appendChild(a);
                        const inner = document.createElement('ul');
                        renderChildren(id, inner);
                        if (inner.children.length) li.appendChild(inner);
                        ulNode.appendChild(li);
                    }
                };
                renderChildren(myId, ul);
                descWrap.appendChild(ul);
            }
        } catch (e) {
            console.warn('[Archivist Sync][V2] renderLocationTree failed', e);
        }
    }

    async _renderLocationCards() {
        try {
            const root = this.element;
            const flags = this._getArchivistFlags();
            // Parent card
            const parentWrap = root.querySelector('.parent-location-card');
            if (parentWrap) {
                parentWrap.innerHTML = '';
                const parentKey = flags.parentLocationId || null;
                if (parentKey) {
                    const journals = game.journal?.contents || [];
                    const parentJ = journals.find(j => {
                        const f = j.getFlag(CONFIG.MODULE_ID, 'archivist') || {};
                        return (f.archivistId && f.archivistId === parentKey) || j.id === parentKey;
                    });
                    if (parentJ) {
                        const card = document.createElement('div');
                        card.className = 'mini-card';
                        const imgSrc = this._resolveSheetImage(parentJ) || 'icons/svg/mountain.svg';
                        card.innerHTML = `<img src="${imgSrc}" alt=""/><span class="name">${foundry.utils.escapeHTML(parentJ.name)}</span><span class="actions"><button type="button" data-action="open-parent" title="Open"><i class="fas fa-external-link-alt"></i></button><button type="button" data-action="clear-parent" title="Unlink"><i class="fas fa-unlink"></i></button></span>`;
                        parentWrap.appendChild(card);
                        const openBtn = card.querySelector('[data-action="open-parent"]');
                        const unlinkBtn = card.querySelector('[data-action="clear-parent"]');
                        if (openBtn) {
                            openBtn.addEventListener('click', ev => {
                                ev.preventDefault();
                                parentJ?.sheet?.render?.({ force: true }).then(app => app?.bringToFront?.());
                            });
                        }
                        if (unlinkBtn) {
                            unlinkBtn.addEventListener('click', async ev => {
                                ev.preventDefault();
                                const success = await setLocationParent(this.document, null);
                                if (success) this.render(false);
                            });
                        }
                    }
                }
            }

            // Scene card
            const sceneWrap = root.querySelector('.linked-scene-card');
            if (sceneWrap) {
                sceneWrap.innerHTML = '';
                const sceneId = (flags.foundryRefs?.scenes || [])[0] || null;
                if (sceneId) {
                    const scene = game.scenes?.get?.(sceneId) || null;
                    if (scene) {
                        const thumb = scene.thumbnail || scene.img || 'icons/svg/village.svg';
                        const card = document.createElement('div');
                        card.className = 'mini-card';
                        card.innerHTML = `<img src="${thumb}" alt=""/><span class="name">${foundry.utils.escapeHTML(scene.name)}</span><span class="actions"><button type="button" data-action="open-scene" title="Open"><i class="fas fa-external-link-alt"></i></button><button type="button" data-action="unlink-scene" title="Unlink"><i class="fas fa-unlink"></i></button></span>`;
                        sceneWrap.appendChild(card);
                        const openBtn = card.querySelector('[data-action="open-scene"]');
                        const unlinkBtn = card.querySelector('[data-action="unlink-scene"]');
                        if (openBtn) openBtn.addEventListener('click', ev => { ev.preventDefault(); scene.view(); });
                        if (unlinkBtn) unlinkBtn.addEventListener('click', async ev => {
                            ev.preventDefault();
                            const next = { ...(flags.foundryRefs || {}) };
                            next.scenes = [];
                            await this.document.setFlag(CONFIG.MODULE_ID, 'archivist', { ...flags, foundryRefs: next });
                            this.render(false);
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('[Archivist Sync][V2] _renderLocationCards failed', e);
        }
    }
}

export class FactionPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/faction.hbs' } }; }
export class RecapPageSheetV2 extends ArchivistBasePageSheetV2 { static PARTS = { form: { template: 'modules/archivist-sync/templates/sheets/recap.hbs' } }; }

export function sheetClassId(Cls) { return `archivist-sync.${Cls.name}`; }


