import numpy as np
import cv2
from scipy.ndimage import label, find_objects

def detect_landing_zones(hazard_map_path, min_area_pixels=5000):
    """
    Detects contiguous 'safe' (green) areas on the hazard map.

    Args:
        hazard_map_path (str): Path to the hazard_map.png.
        min_area_pixels (int): Minimum number of green pixels for an area to be considered a landing zone.

    Returns:
        list: A list of dictionaries, each containing:
            'bbox': (y_start, x_start, y_end, x_end) pixel coordinates of the bounding box.
            'area_pixels': Number of safe pixels in the zone.
            'center_pixel': (y_center, x_center) pixel coordinates.
    """
    hazard_map_rgb = cv2.imread(hazard_map_path, cv2.IMREAD_UNCHANGED)
    if hazard_map_rgb is None:
        print(f"Error: Could not load hazard map from {hazard_map_path}")
        return []

    # Identify green pixels (safe areas)
    # Green pixels are [0, 255, 0]
    green_mask = np.all(hazard_map_rgb == [0, 255, 0], axis=2)

    if not np.any(green_mask):
        print("No green (safe) pixels found on the hazard map.")
        return []

    # Label connected components of green pixels
    # labeled_array: array with unique integer label for each connected component
    # num_features: total number of connected components
    labeled_array, num_features = label(green_mask)

    landing_zones = []

    # Iterate through each detected feature (connected component)
    for i in range(1, num_features + 1):
        # Get the pixels belonging to the current label
        current_zone_mask = (labeled_array == i)
        area_pixels = np.sum(current_zone_mask)

        if area_pixels >= min_area_pixels:
            # Get the bounding box of the current zone
            # find_objects returns slice objects for each dimension
            slice_y, slice_x = find_objects(labeled_array == i)[0] # [0] because we are iterating through single label

            y_start, y_end = slice_y.start, slice_y.stop
            x_start, x_end = slice_x.start, slice_x.stop

            # Calculate center pixel
            center_y = int((y_start + y_end) / 2)
            center_x = int((x_start + x_end) / 2)

            landing_zones.append({
                'bbox': (y_start, x_start, y_end, x_end),
                'area_pixels': int(area_pixels), # Ensure serializable type
                'center_pixel': (center_y, center_x)
            })
    
    print(f"Detected {len(landing_zones)} potential landing zones (min_area_pixels={min_area_pixels}).")
    return landing_zones