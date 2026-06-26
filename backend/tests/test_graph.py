import unittest

from helpers import load_module

graph = load_module("graph_under_test", "app/utils/graph.py")
would_create_cycle = graph.would_create_cycle


class GraphTests(unittest.TestCase):
    def test_detects_cycle_when_new_dependency_closes_path(self):
        edges = [(1, 2), (2, 3)]

        self.assertTrue(would_create_cycle(edges, (3, 1)))

    def test_allows_dependency_that_does_not_create_cycle(self):
        edges = [(1, 2), (2, 3)]

        self.assertFalse(would_create_cycle(edges, (3, 4)))

    def test_self_dependency_is_cycle(self):
        self.assertTrue(would_create_cycle([], (1, 1)))


if __name__ == "__main__":
    unittest.main()
