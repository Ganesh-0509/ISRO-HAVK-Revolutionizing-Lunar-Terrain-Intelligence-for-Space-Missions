# check_elevation.py

def debug_obj_elevation(obj_path):
    min_y = float('inf')
    max_y = float('-inf')
    vertex_count = 0

    with open(obj_path, 'r') as f:
        for line in f:
            if line.startswith('v '):  # Vertex line
                parts = line.strip().split()
                if len(parts) == 4:
                    try:
                        x = float(parts[1])
                        y = float(parts[2])  # Y = elevation
                        z = float(parts[3])
                        min_y = min(min_y, y)
                        max_y = max(max_y, y)
                        vertex_count += 1
                    except ValueError:
                        continue

    if vertex_count == 0:
        print("❌ No valid vertices found in OBJ file.")
    else:
        print(f"✅ Found {vertex_count} vertices.")
        print(f"🔍 Elevation range (Y-axis):")
        print(f"   Min elevation (Y): {min_y:.4f}")
        print(f"   Max elevation (Y): {max_y:.4f}")


# Run the check
debug_obj_elevation("static/processed/lunar_terrain.obj")
