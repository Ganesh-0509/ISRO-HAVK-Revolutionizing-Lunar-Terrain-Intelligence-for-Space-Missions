import numpy as np
import trimesh

def elevation_to_mesh(heightmap): # Removed 'scale' parameter as it's handled externally
    h, w = heightmap.shape

    vertices = []
    faces = []

    # Iterate through the heightmap to create vertices
    # The heightmap already contains the vertically exaggerated elevation values.
    # X, Y=elevation, Z convention
    for y in range(h):
        for x in range(w):
            vertices.append([x, heightmap[y, x], y])

    # Helper function to convert 2D (x, y) grid coordinates to 1D vertex index
    def index(x, y):
        return y * w + x

    # Create faces (two triangles per quad)
    for y in range(h - 1):
        for x in range(w - 1):
            v1 = index(x, y)
            v2 = index(x + 1, y)
            v3 = index(x, y + 1)
            v4 = index(x + 1, y + 1)
            faces.append([v1, v2, v3]) # Triangle 1
            faces.append([v2, v4, v3]) # Triangle 2

    # Create the Trimesh object
    # process=False because we've manually defined vertices and faces
    mesh = trimesh.Trimesh(vertices=np.array(vertices), faces=np.array(faces), process=False)

    return mesh