import { getInternalReferenceConfig } from './config.js';
import { loadInternalReferenceManifest } from './manifestStore.js';
import { buildTaskReferenceCriteria, selectInternalReferences } from './referenceSelector.js';
import { resolveInternalReferenceAsset } from './referenceResolver.js';

function createDisabledContext() {
    return {
        enabled: false,
        matched: false,
        images: [],
        summary: {
            hiddenReferenceLookupEnabled: false,
            hiddenReferenceMatched: false,
            hiddenReferenceCount: 0,
            hiddenReferenceUsage: 'disabled'
        }
    };
}

function createContext({ enabled, criteria, images, usage }) {
    return {
        enabled,
        matched: images.length > 0,
        images,
        summary: {
            hiddenReferenceLookupEnabled: enabled,
            hiddenReferenceMatched: images.length > 0,
            hiddenReferenceCount: images.length,
            hiddenReferenceUsage: usage,
            productType: criteria.productType || null,
            printMode: criteria.printMode || null
        }
    };
}

function getTaskInput(task) {
    return task?.input && typeof task.input === 'object' && !Array.isArray(task.input)
        ? task.input
        : {};
}

function isHermesDesignTask(task) {
    return getTaskInput(task).source === 'hermes_design_task';
}

export async function lookupHiddenInternalReferences(task, options = {}) {
    const config = options.config || getInternalReferenceConfig();
    if (!config.enabled || !isHermesDesignTask(task)) {
        return createDisabledContext();
    }

    const criteria = buildTaskReferenceCriteria(task);

    try {
        const manifestAssets = await loadInternalReferenceManifest(config);
        const selectedAssets = selectInternalReferences(manifestAssets, criteria, config.maxImages);
        const images = [];

        for (const asset of selectedAssets) {
            const resolved = await resolveInternalReferenceAsset(asset, config);
            if (resolved?.dataUri) {
                images.push(resolved);
            }
        }

        return createContext({
            enabled: true,
            criteria,
            images,
            usage: images.length > 0 ? 'matched_pending_model_capability' : 'not_matched'
        });
    } catch (error) {
        console.warn('[InternalReferences] Hidden reference lookup failed', {
            errorType: error?.name || 'Error',
            message: 'Internal reference lookup failed without exposing local paths.'
        });

        return createContext({
            enabled: true,
            criteria,
            images: [],
            usage: 'lookup_error'
        });
    }
}
