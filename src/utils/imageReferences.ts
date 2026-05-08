import { NodeData, NodeStatus, NodeType } from '../types';

export interface EffectiveImageReference {
    id: string;
    url: string;
    type: NodeType;
    sourceNodeId: string;
    sourceNodeType: NodeType;
    isFallback: boolean;
}

const isSuccessfulImageResult = (node: NodeData | undefined) => (
    Boolean(node?.resultUrl && node.status === NodeStatus.SUCCESS)
);

export const isImageReferenceType = (type?: NodeType) => (
    type === NodeType.IMAGE ||
    type === NodeType.CAMERA_ANGLE ||
    type === NodeType.IMAGE_EDITOR
);

export const getEffectiveImageReference = (
    node: NodeData | undefined,
    nodesById: Map<string, NodeData>,
    visited = new Set<string>()
): EffectiveImageReference | null => {
    if (!node || !isImageReferenceType(node.type) || visited.has(node.id)) {
        return null;
    }

    visited.add(node.id);

    if (isSuccessfulImageResult(node)) {
        return {
            id: node.id,
            url: node.resultUrl!,
            type: node.type,
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            isFallback: false
        };
    }

    if (node.type !== NodeType.IMAGE_EDITOR) {
        return null;
    }

    for (const parentId of node.parentIds || []) {
        const parent = nodesById.get(parentId);
        const reference = getEffectiveImageReference(parent, nodesById, visited);

        if (reference) {
            return {
                ...reference,
                id: node.id,
                type: node.type,
                isFallback: true
            };
        }
    }

    return null;
};
