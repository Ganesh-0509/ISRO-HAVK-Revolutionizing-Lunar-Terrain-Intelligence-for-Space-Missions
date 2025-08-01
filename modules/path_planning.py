import numpy as np
import heapq # For priority queue in A* search

class Node:
    """A node class for A* Pathfinding"""
    def __init__(self, parent=None, position=None):
        self.parent = parent
        self.position = position # (x, y) coordinates in the grid

        self.g = 0 # Cost from start node to current node
        self.h = 0 # Heuristic cost from current node to end node
        self.f = 0 # Total cost (g + h)

    def __eq__(self, other):
        if not isinstance(other, Node): # Handle comparison with (x,y) tuples
            return self.position == other
        return self.position == other.position

    # For heapq to compare nodes based on f-cost
    def __lt__(self, other):
        return self.f < other.f

    def __hash__(self): # Needed for putting Node objects into a set/dict
        return hash(self.position)


def calculate_slope_at_pixel(elevation_data, x, y, dx=1, dy=1):
    """
    Calculates the approximate slope at a given pixel (x, y) in degrees.
    Uses central difference for better approximation.
    Assumes dx, dy are horizontal/vertical grid steps.
    """
    h, w = elevation_data.shape
    
    # Ensure indices are within bounds for central difference.
    x_prev = max(0, x - 1)
    x_next = min(w - 1, x + 1)
    y_prev = max(0, y - 1)
    y_next = min(h - 1, y + 1)

    # Calculate dz_dx (horizontal gradient)
    if x_next != x_prev:
        dz_dx = (elevation_data[y, x_next] - elevation_data[y, x_prev]) / (abs(x_next - x_prev) * dx)
    else:
        if x < w - 1: dz_dx = (elevation_data[y, x+1] - elevation_data[y, x]) / dx
        elif x > 0: dz_dx = (elevation_data[y, x] - elevation_data[y, x-1]) / dx
        else: dz_dx = 0

    # Calculate dz_dy (vertical gradient)
    if y_next != y_prev:
        dz_dy = (elevation_data[y_next, x] - elevation_data[y_prev, x]) / (abs(y_next - y_prev) * dy)
    else:
        if y < h - 1: dz_dy = (elevation_data[y+1, x] - elevation_data[y, x]) / dy
        elif y > 0: dz_dy = (elevation_data[y, x] - elevation_data[y-1, x]) / dy
        else: dz_dy = 0
    
    gradient_magnitude = np.sqrt(dz_dx**2 + dz_dy**2)
    slope_angle_rad = np.arctan(gradient_magnitude)
    slope_angle_deg = np.degrees(slope_angle_rad)
    
    return slope_angle_deg


def find_path(elevation_map_path, start_pixel, end_pixel, max_slope_degrees=25, dx=1, dy=1):
    """
    Finds a path from start_pixel to end_pixel on the elevation map
    using A* search, avoiding slopes steeper than max_slope_degrees.
    """
    try:
        elevation_data = np.load(elevation_map_path)
    except FileNotFoundError:
        print(f"Error: Elevation map not found at {elevation_map_path}")
        return None
    
    h, w = elevation_data.shape

    start_node = Node(None, start_pixel)
    end_node = Node(None, end_pixel)

    open_list_heap = [] # Stores (f_cost, node_position) tuples
    open_list_dict = {} # Stores {node_position: node_object}

    heapq.heappush(open_list_heap, (start_node.f, start_node.position))
    open_list_dict[start_node.position] = start_node

    closed_list = set()

    print(f"Starting A* search from {start_pixel} to {end_pixel} on {w}x{h} grid with max slope {max_slope_degrees}°")
    
    while open_list_heap:
        current_f, current_pos = heapq.heappop(open_list_heap)
        current_node = open_list_dict[current_pos]

        if current_pos in closed_list:
            continue

        closed_list.add(current_pos)

        if current_pos == end_node.position:
            path = []
            current = current_node
            while current is not None:
                path.append(current.position)
                current = current.parent
            print(f"Path found in {len(path)} steps.")
            return path[::-1]

        for new_pos_delta in [(0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
            neighbor_pos = (current_pos[0] + new_pos_delta[0], current_pos[1] + new_pos_delta[1])

            if not (0 <= neighbor_pos[0] < w and 0 <= neighbor_pos[1] < h):
                continue

            if neighbor_pos in closed_list:
                continue

            slope = calculate_slope_at_pixel(elevation_data, neighbor_pos[0], neighbor_pos[1], dx, dy)
            if slope > max_slope_degrees:
                continue

            move_cost = 1
            if abs(new_pos_delta[0]) + abs(new_pos_delta[1]) == 2:
                move_cost = np.sqrt(2)
            
            height_diff = abs(elevation_data[neighbor_pos[1], neighbor_pos[0]] - elevation_data[current_pos[1], current_pos[0]])
            
            tentative_g_cost = current_node.g + move_cost + (height_diff * 0.5)

            if neighbor_pos not in open_list_dict or tentative_g_cost < open_list_dict[neighbor_pos].g:
                new_node = Node(current_node, neighbor_pos)
                new_node.g = tentative_g_cost
                new_node.h = abs(neighbor_pos[0] - end_node.position[0]) + abs(neighbor_pos[1] - end_node.position[1])
                new_node.f = new_node.g + new_node.h

                heapq.heappush(open_list_heap, (new_node.f, new_node.position))
                open_list_dict[new_node.position] = new_node

    print("No path found.")
    return None