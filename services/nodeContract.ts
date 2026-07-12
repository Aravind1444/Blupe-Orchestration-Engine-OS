import { Node } from 'reactflow';
import {
  AdminNode,
  CustomNodeDefinitionSnapshot,
  NodeData,
  NodeStatus,
  NodeType,
} from '../types';

export const BUILT_IN_NODE_TYPES = new Set<string>(Object.values(NodeType));
export const CUSTOM_NODE_DRAG_MIME = 'application/blupe-custom-node';

export const isBuiltInNodeType = (type?: string | null): type is NodeType => {
  return Boolean(type && BUILT_IN_NODE_TYPES.has(type));
};

export const getEffectiveNodeType = (node?: Partial<Node<NodeData>> | null): string => {
  if (!node) return '';
  const dataType = node.data?.type;
  return typeof dataType === 'string' && dataType ? dataType : String(node.type || '');
};

export const createCustomNodeSnapshot = (definition: AdminNode): CustomNodeDefinitionSnapshot => ({
  customDefinitionId: definition.id,
  customDefinitionUpdatedAt: definition.updated_at,
  customDisplayName: definition.display_name,
  customDescription: definition.description,
  customIcon: definition.icon_name,
  customColor: definition.color,
  customExecutionType: definition.execution_type,
  customExecutionConfig: definition.execution_config || {},
  customCreditCost: definition.credit_cost ?? 1,
  customConfigSchema: definition.config_schema || {},
});

export const adminNodeFromSnapshot = (
  type: string,
  snapshot: CustomNodeDefinitionSnapshot,
): AdminNode | null => {
  if (!snapshot.customDefinitionId || !snapshot.customExecutionType) {
    return null;
  }

  return {
    id: snapshot.customDefinitionId,
    node_type: type,
    display_name: snapshot.customDisplayName || buildNodeLabel(type),
    description: snapshot.customDescription,
    category: 'Custom',
    icon_name: snapshot.customIcon || 'Box',
    color: snapshot.customColor || '#6366f1',
    config_schema: snapshot.customConfigSchema || {},
    default_config: {},
    execution_type: snapshot.customExecutionType,
    execution_config: snapshot.customExecutionConfig || {},
    credit_cost: snapshot.customCreditCost ?? 1,
    is_active: true,
    created_at: snapshot.customDefinitionUpdatedAt || '',
    updated_at: snapshot.customDefinitionUpdatedAt || '',
  };
};

const getNormalizedNodeStatus = (status?: NodeStatus): NodeStatus => {
  return status && Object.values(NodeStatus).includes(status) ? status : NodeStatus.IDLE;
};

export const normalizeNode = <T extends Partial<Node<NodeData>>>(node: T): T => {
  const effectiveType = getEffectiveNodeType(node);
  const builtIn = isBuiltInNodeType(effectiveType);
  const nextType = builtIn ? effectiveType : 'default';
  const nextData = {
    ...(node.data || {}),
    type: effectiveType,
    status: getNormalizedNodeStatus(node.data?.status),
    output: undefined,
    error: undefined,
    agentState: undefined,
  } as NodeData;

  return {
    ...node,
    type: nextType,
    data: nextData,
  };
};

export const normalizeFlowNodes = <T extends Partial<Node<NodeData>>>(nodes: T[] = []): T[] => {
  return nodes.map(normalizeNode);
};

export const buildNodeLabel = (type: string, definition?: AdminNode): string => {
  if (definition?.display_name) return definition.display_name;
  return type
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};
