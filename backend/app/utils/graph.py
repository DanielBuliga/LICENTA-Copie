from collections import defaultdict, deque


def would_create_cycle(edges: list[tuple[int, int]], new_edge: tuple[int, int]) -> bool:
    """
    edges: existing directed edges (a -> b)
    new_edge: edge to add (u -> v)
    Return True if adding (u -> v) creates a cycle.
    """

    u, v = new_edge

    # Quick self-cycle
    if u == v:
        return True

    # Build adjacency list with the new edge included
    adj = defaultdict(list)
    nodes = set()

    for a, b in edges:
        adj[a].append(b)
        nodes.add(a)
        nodes.add(b)

    adj[u].append(v)
    nodes.add(u)
    nodes.add(v)

    # Kahn algorithm to detect cycle:
    indeg = {n: 0 for n in nodes}
    for a in adj:
        for b in adj[a]:
            indeg[b] = indeg.get(b, 0) + 1
            if a not in indeg:
                indeg[a] = indeg.get(a, 0)

    q = deque([n for n, d in indeg.items() if d == 0])
    visited = 0

    while q:
        n = q.popleft()
        visited += 1
        for nxt in adj.get(n, []):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                q.append(nxt)

    # If not all nodes were visited, we have a cycle
    return visited != len(indeg)