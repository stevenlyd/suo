/** Iterative graph algorithms. Edges point prerequisite -> consumer. */
export function topological(ids, edges) {
    const adjacency = new Map(ids.map(id => [id, []])), indegree = new Map(ids.map(id => [id, 0]));
    if (adjacency.size !== ids.length)
        throw new Error('duplicate graph node');
    const seen = new Set();
    for (const [from, to] of edges) {
        if (!adjacency.has(from) || !adjacency.has(to))
            throw new Error(`missing graph reference: ${from} -> ${to}`);
        const key = JSON.stringify([from, to]);
        if (seen.has(key))
            throw new Error(`duplicate graph edge: ${from} -> ${to}`);
        seen.add(key);
        adjacency.get(from).push(to);
        indegree.set(to, indegree.get(to) + 1);
    }
    const queue = ids.filter(id => indegree.get(id) === 0), order = [];
    for (let head = 0; head < queue.length; head++) {
        const id = queue[head];
        order.push(id);
        for (const next of adjacency.get(id)) {
            indegree.set(next, indegree.get(next) - 1);
            if (indegree.get(next) === 0)
                queue.push(next);
        }
    }
    if (order.length === ids.length)
        return order;
    const color = new Map(), position = new Map();
    for (const root of ids) {
        if (color.has(root))
            continue;
        const stack = [{ id: root, index: 0 }];
        color.set(root, 1);
        position.set(root, 0);
        while (stack.length) {
            const frame = stack[stack.length - 1], next = adjacency.get(frame.id)[frame.index++];
            if (next === undefined) {
                color.set(frame.id, 2);
                position.delete(frame.id);
                stack.pop();
                continue;
            }
            if (color.get(next) === 1)
                throw new Error(`graph cycle: ${stack.slice(position.get(next)).map(f => f.id).concat(next).join(' -> ')}`);
            if (!color.has(next)) {
                color.set(next, 1);
                position.set(next, stack.length);
                stack.push({ id: next, index: 0 });
            }
        }
    }
    throw new Error('graph cycle');
}
export function affected(ids, oldEdges, newEdges) {
    const adjacency = new Map();
    for (const edges of [oldEdges, newEdges])
        for (const [from, to] of edges) {
            if (!adjacency.has(from))
                adjacency.set(from, new Set());
            adjacency.get(from).add(to);
        }
    const seen = new Set(ids), queue = [...seen];
    for (let head = 0; head < queue.length; head++)
        for (const id of adjacency.get(queue[head]) ?? [])
            if (!seen.has(id)) {
                seen.add(id);
                queue.push(id);
            }
    return seen;
}
//# sourceMappingURL=unit-graph.js.map