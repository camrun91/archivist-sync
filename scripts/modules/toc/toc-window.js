// Archivist Hub window with basic list and actions
import { settingsManager } from '../settings-manager.js';
import { archivistApi } from '../../services/archivist-api.js';
import { linkIndexer } from '../links/indexer.js';
import { reconcileService } from '../reconcile/reconcile-service.js';
import { Utils } from '../utils.js';

class ArchivistHub extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    constructor(options = {}) {
        super(options);
        this.active = 'pcs';
        this._charTypeById = new Map(); // archivistId => 'PC'|'NPC'
    }

    static DEFAULT_OPTIONS = {
        id: 'archivist-hub',
        window: { title: 'Archivist Hub', icon: 'fas fa-list', resizable: true },
        position: { width: 500, height: 600 },
        classes: ['archivist-sync', 'archivist-hub'],
        actions: {
            switchTab: ArchivistHub.prototype._onSwitchTab,
            openRow: ArchivistHub.prototype._onOpenRow,
            togglePerm: ArchivistHub.prototype._onTogglePerm,
            createRow: ArchivistHub.prototype._onCreateRow,
            syncAll: ArchivistHub.prototype._onSyncAll,
            openSyncDialog: ArchivistHub.prototype._onOpenSyncDialog,
        },
    };

    static PARTS = {
        form: { template: 'modules/archivist-sync/templates/toc/toc-window.hbs' },
    };

    async _prepareContext() {
        const tabs = [
            { id: 'pcs', icon: 'fas fa-user', title: 'Player Characters' },
            { id: 'npcs', icon: 'fas fa-user-ninja', title: 'Non-Player Characters' },
            { id: 'items', icon: 'fas fa-gem', title: 'Items' },
            { id: 'locations', icon: 'fas fa-location-dot', title: 'Locations' },
            { id: 'factions', icon: 'fas fa-people-group', title: 'Factions' },
            { id: 'recaps', icon: 'fas fa-scroll', title: 'Recaps' },
        ];
        if (this.active === 'pcs' || this.active === 'npcs') {
            await this._ensureCharacterTypeMap();
        }
        const rows = await this._rowsFor(this.active);
        // Attach a best-available image (journal.img, else linked actor/item img)
        for (const r of rows) {
            try {
                if (r.kind === 'journal') {
                    const j = game.journal?.get?.(r.id);
                    let src = String(j?.img || '').trim();
                    if (!src) {
                        const f = j?.getFlag?.('archivist-sync', 'archivist') || {};
                        const st = String(f.sheetType || '').toLowerCase();
                        // Prefer explicit archivist image flag if present for any sheet type
                        const flagImg = String(f.image || '').trim();
                        if (flagImg) src = flagImg;
                        // If still no image, check linked Foundry docs
                        if (!src) {
                            if (st === 'pc' || st === 'npc' || st === 'character') {
                                const actorId = (f.foundryRefs?.actors || [])[0];
                                const actor = actorId ? game.actors?.get?.(actorId) : null;
                                if (actor?.img) src = String(actor.img).trim();
                            } else if (st === 'item') {
                                const itemId = (f.foundryRefs?.items || [])[0];
                                const itm = itemId ? game.items?.get?.(itemId) : null;
                                if (itm?.img) src = String(itm.img).trim();
                            } else if (st === 'location') {
                                const sceneId = (f.foundryRefs?.scenes || [])[0];
                                const scene = sceneId ? game.scenes?.get?.(sceneId) : null;
                                if (scene) src = String(scene.thumbnail || scene.img || '').trim();
                            }
                        }
                    }
                    // Fallback: Archivist Hub image flag
                    if (!src) {
                        const cc = String(j?.getFlag?.('archivist-hub', 'image') || '').trim();
                        if (cc) src = cc;
                    }
                    if (src) r.img = src;
                }
            } catch (_) { }
        }
        return { tabs, active: this.active, rows, isGM: game.user?.isGM };
    }

    async _rowsFor(tab) {
        const rows = [];
        const canSee = d => !d || game.user?.isGM || d.testUserPermission?.(game.user, 'OBSERVED');
        const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        const NON = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        const iconForTab = t => ({
            pcs: 'fas fa-user',
            npcs: 'fas fa-user-ninja',
            items: 'fas fa-gem',
            locations: 'fas fa-location-dot',
            factions: 'fas fa-people-group',
            recaps: 'fas fa-scroll',
        })[t] || 'fas fa-file';
        const ownershipIcon = level => (Number(level) >= OBS ? 'fas fa-eye' : 'fas fa-eye-slash');
        if (tab === 'factions' || tab === 'locations') {
            const fix = tab.slice(0, -1); // 'faction' | 'location'
            const js = game.journal?.contents || [];
            for (const j of js) {
                const flags = j.getFlag('archivist-sync', 'archivist') || {};
                if (flags.sheetType !== fix) continue;
                if (!canSee(j)) continue;
                rows.push({
                    id: j.id,
                    uuid: j.uuid,
                    name: j.name,
                    kind: 'journal',
                    iconClass: iconForTab(tab),
                    ownershipIcon: ownershipIcon(j?.ownership?.default ?? NON),
                });
            }
            rows.sort((a, b) => a.name.localeCompare(b.name));
            return rows;
        }
        if (tab === 'items') {
            const js = game.journal?.contents || [];
            for (const j of js) {
                const flags = j.getFlag('archivist-sync', 'archivist') || {};
                if (flags.sheetType !== 'item') continue;
                if (!canSee(j)) continue;
                rows.push({
                    id: j.id,
                    uuid: j.uuid,
                    name: j.name,
                    kind: 'journal',
                    iconClass: iconForTab(tab),
                    ownershipIcon: ownershipIcon(j?.ownership?.default ?? NON),
                });
            }
            rows.sort((a, b) => a.name.localeCompare(b.name));
            return rows;
        }
        if (tab === 'pcs' || tab === 'npcs') {
            const want = tab === 'pcs' ? 'PC' : 'NPC';
            const js = game.journal?.contents || [];
            for (const j of js) {
                const flags = j.getFlag('archivist-sync', 'archivist') || {};
                const isCharacter = flags.sheetType === 'pc' || flags.sheetType === 'npc' || flags.sheetType === 'character';
                if (!isCharacter) continue;
                if (!canSee(j)) continue;
                const type = this._charTypeById.get(flags.archivistId) || null;
                if (!type || type !== want) continue;
                rows.push({
                    id: j.id,
                    uuid: j.uuid,
                    name: j.name,
                    kind: 'journal',
                    iconClass: iconForTab(tab),
                    ownershipIcon: ownershipIcon(j?.ownership?.default ?? NON),
                });
            }
            rows.sort((a, b) => a.name.localeCompare(b.name));
            return rows;
        }
        if (tab === 'recaps') {
            // List recap pages under the Recaps container OR standalone Recap journals in Recaps folder
            const list = [];
            const allJournals = game.journal?.contents || [];

            // Model A: Single Recaps container with pages
            const recapsContainer = allJournals.find(x => x.name === 'Recaps' && !x.folder);
            const pages = recapsContainer?.pages?.contents || [];
            for (const p of pages) {
                if (p.type !== 'text') continue;
                const title = p.name || 'Session';
                // Format sessionDate if available (page flag)
                const rawDate = p.getFlag?.('archivist-sync', 'sessionDate') || null;
                let dateStr = '';
                if (rawDate) {
                    try {
                        const d = new Date(rawDate);
                        if (!isNaN(d.getTime())) {
                            dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                        }
                    } catch (_) { }
                }
                const name = dateStr ? `${title} - ${dateStr}` : title;
                list.push({ id: p.id, uuid: p.uuid, name, kind: 'recap', parentId: recapsContainer?.id, iconClass: iconForTab(tab), ownershipIcon: 'fas fa-eye' });
            }

            // Model B: Individual recap journals placed in a 'Recaps' folder
            const recapsFolder = (game.folders?.contents || []).find(f => f.type === 'JournalEntry' && f.name === 'Recaps');
            if (recapsFolder) {
                for (const j of allJournals) {
                    if (j.folder?.id !== recapsFolder.id) continue;
                    // Prefer Recap sheet type flag if present
                    const flags = j.getFlag('archivist-sync', 'archivist') || {};
                    const isRecap = String(flags.sheetType || '').toLowerCase() === 'recap' || true; // treat everything in folder as recap
                    if (!isRecap) continue;
                    const title = j.name || 'Session';
                    const rawDate = j.getFlag?.('archivist-sync', 'sessionDate') || null;
                    let dateStr = '';
                    if (rawDate) {
                        try {
                            const d = new Date(rawDate);
                            if (!isNaN(d.getTime())) {
                                dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                            }
                        } catch (_) { }
                    }
                    const name = dateStr ? `${title} - ${dateStr}` : title;
                    list.push({ id: j.id, uuid: j.uuid, name, kind: 'journal', iconClass: iconForTab(tab), ownershipIcon: 'fas fa-eye' });
                }
            }

            // Sort by stored sessionDate flag if available
            list.sort((a, b) => {
                try {
                    const getDate = (row) => {
                        if (row.kind === 'recap') {
                            const p = fromUuidSync(row.uuid);
                            return new Date(p?.getFlag?.('archivist-sync', 'sessionDate') || 0).getTime();
                        }
                        if (row.kind === 'journal') {
                            const j = game.journal.get(row.id);
                            return new Date(j?.getFlag?.('archivist-sync', 'sessionDate') || 0).getTime();
                        }
                        return 0;
                    };
                    return getDate(a) - getDate(b);
                } catch (_) {
                    return a.name.localeCompare(b.name);
                }
            });
            return list;
        }
        return rows;
    }

    async _ensureCharacterTypeMap() {
        try {
            // If we already have a map for current world, skip unless empty
            if (this._charTypeById && this._charTypeById.size > 0) return;
            const apiKey = settingsManager.getApiKey?.();
            const campaignId = settingsManager.getSelectedWorldId?.();
            if (!apiKey || !campaignId) return;
            const res = await archivistApi.listCharacters(apiKey, campaignId);
            if (!res?.success) return;
            this._charTypeById.clear();
            for (const c of res.data || []) {
                const t = String(c.type || c.character_type || '').toUpperCase();
                if (t === 'PC' || t === 'NPC') this._charTypeById.set(c.id, t);
            }
        } catch (e) {
            console.warn('[Archivist Hub] ensureCharacterTypeMap failed', e);
        }
    }

    async _onSwitchTab(event) {
        event.preventDefault();
        const el = event?.target?.closest?.('[data-tab]');
        if (!el) return;
        this.active = el.dataset.tab || this.active;
        await this.render();
    }

    async _onOpenRow(event) {
        event.preventDefault();
        const li = event?.target?.closest?.('li[data-id]');
        if (!li) return;
        const kind = li.dataset.kind;
        const id = li.dataset.id;
        try {
            if (kind === 'journal') {
                const j = game.journal.get(id);
                if (j) {
                    // Use the journal's registered sheet instead of openV2SheetFor
                    j.sheet.render(true);
                }
                return;
            }
            if (kind === 'recap') {
                const uuid = li.dataset.uuid;
                const page = await fromUuid(uuid);
                const entry = page?.parent;
                if (entry) await entry?.sheet?.render?.(true);
                return;
            }
        } catch (e) {
            console.warn('[Archivist Hub] open failed', e);
        }
    }

    async _onTogglePerm(event) {
        event.preventDefault();
        if (!game.user?.isGM) return; // players cannot toggle visibility
        const li = event?.target?.closest?.('li[data-id]');
        if (!li) return;
        const kind = li.dataset.kind;
        const id = li.dataset.id;
        const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        const NON = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        try {
            if (kind === 'journal') {
                const j = game.journal.get(id);
                const cur = Number(j?.ownership?.default ?? NON);
                const next = cur >= OBS ? NON : OBS;
                await j.update({ ownership: { default: next } });
                await this.render();
                return;
            }
        } catch (e) {
            console.warn('[Archivist Hub] perm toggle failed', e);
        }
    }

    async _onCreateRow(event) {
        event.preventDefault();
        if (!game.user?.isGM) return; // players cannot create entries
        try {
            const typeLabel = {
                pcs: 'PC',
                npcs: 'NPC',
                items: 'Item',
                locations: 'Location',
                factions: 'Faction',
            }[this.active] || 'Entry';
            const name = await this._promptForName(`Create New ${typeLabel}`);
            if (!name) return;

            const worldId = settingsManager.getSelectedWorldId?.();
            let journal = null;

            // Create the appropriate custom sheet journal
            if (this.active === 'pcs') {
                journal = await Utils.createPcJournal({ name, worldId });
            } else if (this.active === 'npcs') {
                journal = await Utils.createNpcJournal({ name, worldId });
            } else if (this.active === 'items') {
                journal = await Utils.createItemJournal({ name, worldId });
            } else if (this.active === 'locations') {
                journal = await Utils.createLocationJournal({ name, worldId });
            } else if (this.active === 'factions') {
                journal = await Utils.createFactionJournal({ name, worldId });
            } else if (this.active === 'recaps') {
                journal = await Utils.createRecapJournal({ name, worldId });
            }

            // Open the newly created sheet via standard render
            if (journal) {
                await journal.sheet?.render?.(true);
                setTimeout(() => journal.sheet?.bringToFront?.(), 50);
            }

            await this.render();
        } catch (e) {
            console.warn('[Archivist Hub] create failed', e);
        }
    }

    async _promptForName(title) {
        try {
            const name = await foundry.applications.api.DialogV2.prompt({
                window: { title },
                content: `
                    <div class="form-group">
                        <label>Name:</label>
                        <input type="text" name="name" placeholder="Enter name..." autofocus style="width: 100%;" />
                    </div>
                `,
                ok: {
                    icon: '<i class="fas fa-check"></i>',
                    label: 'Create',
                    callback: (event, button) => {
                        const enteredName = button.form.elements.name.value.trim();
                        return enteredName || null;
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: 'Cancel'
                },
                rejectClose: true,
            });
            return name;
        } catch (e) {
            // User cancelled
            return null;
        }
    }


    async _onSyncAll(event) {
        event.preventDefault();
        try {
            const { SyncDialog } = await import('../../dialogs/sync-dialog.js');
            const dlg = new SyncDialog();
            window.__ARCHIVIST_SYNC__ = dlg;
            dlg.render(true);
        } catch (e) {
            console.warn('[Archivist Hub] open Sync Manager failed', e);
            ui.notifications?.error?.('Failed to open Sync Manager');
        }
    }

    async _onOpenSyncDialog(event) {
        event?.preventDefault?.();
        if (!game.user?.isGM) return; // GM-only
        try {
            const { SyncDialog } = await import('../../dialogs/sync-dialog.js');
            const dlg = new SyncDialog();
            window.__ARCHIVIST_SYNC__ = dlg;
            dlg.render(true);
        } catch (e) {
            console.warn('[Archivist Hub] openSyncDialog failed', e);
        }
    }

    _onRender(context, options) {
        super._onRender(context, options);
        // Drag-and-drop removed by request; no draggable rows or selection state
    }
}

export { ArchivistHub };
export const ArchivistTOC = ArchivistHub;


