// System adapter: normalize fields across systems without writing back to system data
export class SystemAdapter {
  static actorName(actor) {
    return actor?.name || '';
  }
  static actorImage(actor) {
    return String(actor?.img || '');
  }
  static actorDescription(actor) {
    const sys = actor?.system || {};
    const get = (obj, path) => {
      try {
        if (foundry?.utils?.getProperty)
          return foundry.utils.getProperty(obj, path);
      } catch (_) {}
      // Tiny fallback for dot paths
      return String(path)
        .split('.')
        .reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
    };

    const systemId = String(game?.system?.id || '').toLowerCase();
    const isPC = String(actor?.type || '').toLowerCase() === 'character';
    const isNPC = String(actor?.type || '').toLowerCase() === 'npc';
    try {
      console.log('[SystemAdapter.actorDescription] Start', {
        systemId,
        actorId: actor?.id,
        actorName: actor?.name,
        actorType: actor?.type,
      });
    } catch (_) {}

    // Ordered candidate paths by system and actor type
    /** @type {string[]} */
    let candidates = [];
    if (systemId === 'dnd5e') {
      candidates = [
        'details.biography.value', // dnd5e v10+
        'details.biography.public',
        'description.value',
      ];
    } else if (systemId === 'pf2e') {
      if (isPC) {
        candidates = [
          'details.biography.backstory', // PF2e PCs
          'details.publicNotes',
          'description.value',
        ];
      } else if (isNPC) {
        candidates = [
          'details.publicNotes', // PF2e NPCs
          'details.notes.description',
          'description.value',
        ];
      } else {
        candidates = [
          'details.biography.backstory',
          'details.publicNotes',
          'details.notes.description',
          'description.value',
        ];
      }
    } else {
      // Generic fallbacks for unknown systems
      candidates = [
        'details.biography.value',
        'details.biography.public',
        'description.value',
        'details.description',
        'details.publicNotes',
        'description',
      ];
    }

    // Probe in order and return the first non-empty string
    for (const p of candidates) {
      const v = get(sys, p);
      if (typeof v === 'string' && v.trim()) {
        try {
          console.log('[SystemAdapter.actorDescription] Selected path', {
            path: p,
            length: String(v).length,
          });
        } catch (_) {}
        return v;
      }
    }
    try {
      console.log(
        '[SystemAdapter.actorDescription] No description found for actor'
      );
    } catch (_) {}
    return '';
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
