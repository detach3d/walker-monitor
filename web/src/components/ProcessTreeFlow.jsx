import React, { useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    Handle,
    Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import './ProcessTreeFlow.css';

const getDirectionConfig = (direction) => {
    if (direction === 'LR') {
        return {
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            primaryGap: 260,
            secondaryGap: 140,
        };
    }

    return {
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        primaryGap: 170,
        secondaryGap: 280,
    };
};

const ProcessNode = ({ data }) => (
    <div className="process-flow-node">
        <Handle
            type="target"
            position={data.targetPosition}
            className="process-flow-handle"
        />
        <div className="process-flow-node-header">
            <span className="process-flow-pid">PID {data.pid}</span>
            <span className="process-flow-count">{data.childrenCount} children</span>
        </div>
        <div className="process-flow-command">{data.comm}</div>
        <Handle
            type="source"
            position={data.sourcePosition}
            className="process-flow-handle"
        />
    </div>
);

const nodeTypes = {
    processNode: ProcessNode,
};

const buildFlowGraph = (processes, direction, edgeType) => {
    const nodeMap = new Map();
    const edgeSet = new Set();
    const adjacency = new Map();
    const inDegree = new Map();
    const directionConfig = getDirectionConfig(direction);

    const ensureNode = (pid, comm = `pid-${pid}`) => {
        const key = String(pid);
        if (!nodeMap.has(key)) {
            nodeMap.set(key, {
                pid,
                comm,
                parents: [],
                children: [],
            });
        }

        if (!adjacency.has(key)) adjacency.set(key, new Set());
        if (!inDegree.has(key)) inDegree.set(key, 0);
        return nodeMap.get(key);
    };

    const addEdge = (fromPid, toPid) => {
        if (fromPid === toPid) return;
        const from = String(fromPid);
        const to = String(toPid);
        const edgeKey = `${from}->${to}`;
        if (edgeSet.has(edgeKey)) return;
        edgeSet.add(edgeKey);

        if (!adjacency.has(from)) adjacency.set(from, new Set());
        if (!inDegree.has(to)) inDegree.set(to, 0);
        if (!inDegree.has(from)) inDegree.set(from, 0);
        adjacency.get(from).add(to);
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
    };

    processes.forEach((process) => {
        const node = ensureNode(process.pid, process.comm);
        node.comm = process.comm || node.comm;
        node.parents = process.parents || [];
        node.children = process.children || [];
    });

    nodeMap.forEach((node) => {
        (node.children || []).forEach((child) => {
            ensureNode(child.pid, child.comm);
            addEdge(node.pid, child.pid);
        });
    });

    if (edgeSet.size === 0) {
        nodeMap.forEach((node) => {
            (node.parents || []).forEach((parent) => {
                ensureNode(parent.pid, parent.comm);
                addEdge(parent.pid, node.pid);
            });
        });
    }

    const levels = new Map();
    const queue = [...inDegree.entries()]
        .filter(([, degree]) => degree === 0)
        .map(([id]) => id)
        .sort((a, b) => Number(a) - Number(b));
    const mutableInDegree = new Map(inDegree);
    const visited = new Set();

    queue.forEach((id) => levels.set(id, 0));

    while (queue.length > 0) {
        const current = queue.shift();
        visited.add(current);
        const currentLevel = levels.get(current) || 0;
        const children = adjacency.get(current) || new Set();

        [...children].forEach((child) => {
            levels.set(child, Math.max(levels.get(child) || 0, currentLevel + 1));
            mutableInDegree.set(child, (mutableInDegree.get(child) || 1) - 1);
            if (mutableInDegree.get(child) === 0) {
                queue.push(child);
            }
        });
    }

    let fallbackLevel = Math.max(...levels.values(), 0) + 1;
    [...nodeMap.keys()]
        .sort((a, b) => Number(a) - Number(b))
        .forEach((id) => {
            if (!visited.has(id)) {
                levels.set(id, fallbackLevel);
                fallbackLevel += 1;
            }
        });

    const nodesByLevel = new Map();
    levels.forEach((level, id) => {
        if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
        nodesByLevel.get(level).push(id);
    });

    [...nodesByLevel.values()].forEach((ids) => ids.sort((a, b) => Number(a) - Number(b)));

    const nodes = [];
    const sortedLevels = [...nodesByLevel.keys()].sort((a, b) => a - b);

    sortedLevels.forEach((level) => {
        const ids = nodesByLevel.get(level) || [];
        const centeredOffset = ((ids.length - 1) * directionConfig.secondaryGap) / 2;
        ids.forEach((id, index) => {
            const process = nodeMap.get(id);
            const primary = level * directionConfig.primaryGap;
            const secondary = index * directionConfig.secondaryGap - centeredOffset;

            const position =
                direction === 'LR'
                    ? { x: primary, y: secondary }
                    : { x: secondary, y: primary };

            nodes.push({
                id,
                type: 'processNode',
                position,
                data: {
                    pid: process.pid,
                    comm: process.comm,
                    process,
                    childrenCount: process.children?.length || 0,
                    sourcePosition: directionConfig.sourcePosition,
                    targetPosition: directionConfig.targetPosition,
                },
                draggable: false,
                selectable: true,
            });
        });
    });

    const edges = [...edgeSet].map((edgeKey) => {
        const [source, target] = edgeKey.split('->');
        return {
            id: edgeKey,
            source,
            target,
            type: edgeType,
            animated: false,
            style: {
                stroke: '#4B5563',
                strokeWidth: 1.5,
            },
        };
    });

    return { nodes, edges };
};

const ProcessTreeFlow = ({
    processes = [],
    direction = 'TB',
    edgeType = 'smoothstep',
    onNodeClick,
    className = '',
}) => {
    const { nodes, edges } = useMemo(
        () => buildFlowGraph(processes, direction, edgeType),
        [processes, direction, edgeType]
    );

    const handleNodeClick = (_, node) => {
        if (typeof onNodeClick === 'function') {
            onNodeClick(node.data.process);
        }
    };

    if (!processes.length) {
        return (
            <div className={`process-flow-empty ${className}`}>
                No process tree data to visualize.
            </div>
        );
    }

    return (
        <div className={`process-flow-container ${className}`}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                panOnDrag
                panOnScroll
                zoomOnScroll
                minZoom={0.2}
                maxZoom={1.8}
                defaultEdgeOptions={{ type: edgeType }}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#1F2937" gap={20} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
};

export default ProcessTreeFlow;
