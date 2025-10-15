// System adapter: normalize fields across systems without writing back to system data
export class SystemAdapter {
    static actorName(actor) {
        return actor?.name || '';
    }
    static actorImage(actor) {
        return String(actor?.img || '');
    }
    static actorDescription(actor) {
        // Common systems: dnd5e, pf2e; fall back to biography.value
        const sys = actor?.system || {};
        const dnd5e = sys?.details?.biography?.value;
        const pf2e = sys?.details?.publicNotes;
        return String(dnd5e ?? pf2e ?? '');
    }
    static itemName(item) {
        return item?.name || '';
    }
    static itemImage(item) {
        return String(item?.img || '');
    }
    static itemDescription(item) {
        const sys = item?.system || {};
        const dnd5e = sys?.description?.value;
        return String(dnd5e ?? sys?.description ?? '');
    }
}


