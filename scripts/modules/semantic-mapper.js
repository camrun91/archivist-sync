/**
 * Semantic mapping helper using browser embeddings via @xenova/transformers
 * Lazily loads a small embeddings model and caches in memory; CDN caches model in IndexedDB
 */

let embedderInstance = null;

async function getEmbedder() {
    if (embedderInstance) return embedderInstance;
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers');
    embedderInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return embedderInstance;
}

function cosineSimilarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const ai = a[i];
        const bi = b[i];
        dot += ai * bi;
        na += ai * ai;
        nb += bi * bi;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/**
 * Suggest best string field path from candidates given concept labels
 * @param {Array<{path:string,label?:string}>} candidates
 * @param {Array<string>} concepts
 * @returns {Promise<{path:string,label?:string,score:number}|null>}
 */
export async function suggestBestStringPath(candidates, concepts) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    const embedder = await getEmbedder();
    const labels = concepts.concat(candidates.map(c => c.label || c.path));
    const output = await embedder(labels, { pooling: 'mean', normalize: true });
    const dim = output.dim;
    const data = output.data;

    // Average concept vectors
    const agg = new Float32Array(dim);
    for (let i = 0; i < concepts.length; i++) {
        const off = i * dim;
        for (let d = 0; d < dim; d++) agg[d] += data[off + d];
    }
    for (let d = 0; d < dim; d++) agg[d] /= Math.max(1, concepts.length);

    let best = null;
    const candBase = concepts.length * dim;
    for (let i = 0; i < candidates.length; i++) {
        const off = candBase + i * dim;
        const vec = data.subarray(off, off + dim);
        const score = cosineSimilarity(agg, vec);
        if (!best || score > best.score) best = { ...candidates[i], score };
    }
    return best;
}

/**
 * Build candidate paths by scanning a Foundry actor.system object for string leaves
 * @param {object} system
 * @param {RegExp} includeRegex optional filter for keys (e.g., /(bio|descr|name|notes)/i)
 */
export function discoverStringPaths(system, includeRegex) {
    const results = [];
    const scan = (obj, path = []) => {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
            const next = [...path, k];
            if (typeof v === 'string') {
                const p = 'system.' + next.join('.');
                if (!includeRegex || includeRegex.test(p)) results.push({ path: p });
            } else if (v && typeof v === 'object' && next.length < 6) {
                scan(v, next);
            }
        }
    };
    scan(system);
    return results;
}


