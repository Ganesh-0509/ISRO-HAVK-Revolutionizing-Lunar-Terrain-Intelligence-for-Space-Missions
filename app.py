import cv2
from flask import Flask, render_template, request, redirect, url_for, send_from_directory, jsonify
import os
import numpy as np
from modules.preprocess import preprocess_image
from modules.gradient import compute_gradients
from modules.reconstruct import reconstruct_surface
from modules.mesh import elevation_to_mesh
from modules.analysis import detect_landing_zones
from modules.path_planning import find_path

from PIL import Image
import shutil

app = Flask(__file__) 

UPLOAD_FOLDER = 'static/uploads'
PROCESSED_FOLDER = 'static/processed'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)
os.makedirs('static/images', exist_ok=True)
os.makedirs('static/icons', exist_ok=True)

last_processed_image_filename = None
last_original_image_filename = None
last_normalization_enabled = True
last_denoising_enabled = True
last_exaggeration_enabled = True

last_min_elevation = "N/A"
last_max_elevation = "N/A"
last_avg_slope = "N/A"
last_danger_area_percent = "N/A"
last_top_points = []
last_bottom_points = []
last_slope_distribution = {}


last_image_width = 0
last_image_height = 0

last_landing_zones_data = []


@app.route('/', methods=['GET', 'POST']) 
def upload():
    global last_processed_image_filename
    global last_original_image_filename
    global last_normalization_enabled
    global last_denoising_enabled
    global last_exaggeration_enabled
    global last_min_elevation
    global last_max_elevation
    global last_avg_slope
    global last_danger_area_percent
    global last_landing_zones_data
    global last_image_width
    global last_image_height
    global last_top_points
    global last_bottom_points
    global last_slope_distribution


    original_url = None
    processed_url = None

    if request.method == 'POST':
        last_normalization_enabled = 'normalization_enabled' in request.form
        last_denoising_enabled = 'denoising_enabled' in request.form
        last_exaggeration_enabled = 'exaggeration_enabled' in request.form

        if 'file' not in request.files or request.files['file'].filename == '':
            print("No file selected for upload!")
            return render_template('upload.html',
                                   original_url=original_url,
                                   processed_url=processed_url,
                                   normalization_enabled_checked=last_normalization_enabled,
                                   denoising_enabled_checked=last_denoising_enabled,
                                   exaggeration_enabled_checked=last_exaggeration_enabled)

        for f in os.listdir(PROCESSED_FOLDER):
            full_path = os.path.join(PROCESSED_FOLDER, f)
            if os.path.isfile(full_path): os.remove(full_path)
            elif os.path.isdir(full_path): shutil.rmtree(full_path)
        
        for f in os.listdir(UPLOAD_FOLDER):
            full_path = os.path.join(UPLOAD_FOLDER, f)
            if os.path.isfile(full_path): os.remove(full_path)

        file = request.files['file']
        filename = file.filename
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        last_original_image_filename = filename

        print(f"Preprocessing Options: Normalization={last_normalization_enabled}, Denoising={last_denoising_enabled}, Exaggeration={last_exaggeration_enabled}")

        processed_filename = f"processed_{filename}"
        processed_path = os.path.join(PROCESSED_FOLDER, processed_filename)
        
        preprocess_image(filepath, processed_path, 
                         normalize_hist=last_normalization_enabled, 
                         denoise=last_denoising_enabled)

        last_processed_image_filename = processed_filename
        
        try:
            processed_img_for_dims = cv2.imread(processed_path, cv2.IMREAD_GRAYSCALE)
            if processed_img_for_dims is not None:
                last_image_height, last_image_width = processed_img_for_dims.shape
                print(f"Stored image dimensions: {last_image_width}x{last_image_height}")
            else:
                print(f"Warning: Could not read processed image for dimensions at {processed_path}. Defaulting to 0x0.")
                last_image_width = 0
                last_image_height = 0
        except Exception as e:
            print(f"Error getting processed image dimensions: {e}. Defaulting to 0x0.")
            last_image_width = 0
            last_image_height = 0


        grad_x_path = os.path.join(PROCESSED_FOLDER, f"grad_x_{filename}.png")
        grad_y_path = os.path.join(PROCESSED_FOLDER, f"grad_y_{filename}.png")
        gx_float, gy_float = compute_gradients(processed_path, grad_x_path, grad_y_path)

        print(f"GX stats (before reconstruction): min={np.min(gx_float):.4f}, max={np.max(gx_float):.4f}, mean={np.mean(gx_float):.4f}, std={np.std(gx_float):.4f}")
        print(f"GY stats (before reconstruction): min={np.min(gy_float):.4f}, max={np.max(gy_float):.4f}, mean={np.mean(gy_float):.4f}, std={np.std(gy_float):.4f}")

        elevation = reconstruct_surface(gx_float, gy_float)

        min_base_elev = np.min(elevation)
        max_base_elev = np.max(elevation)
        
        print(f"Elevation stats (after reconstruction, before final scale): min={min_base_elev:.4f}, max={max_base_elev:.4f}, range={max_base_elev - min_base_elev:.4f}")

        if (max_base_elev - min_base_elev) > 1e-6:
            elevation = (elevation - min_base_elev) / (max_base_elev - min_base_elev)
        else:
            elevation = np.zeros_like(elevation)

        if last_exaggeration_enabled:
            elevation *= 200.0 
            print("✅ Vertical Exaggeration: Enabled (factor 200.0)")
        else:
            elevation *= 50.0
            print("✅ Vertical Exaggeration: Disabled (base scale 50.0)")

        print("✅ Elevation stats after final scaling:")
        print("   Min elevation:", np.min(elevation))
        print("   Max elevation:", np.max(elevation))
        print("   Mean elevation:", np.mean(elevation))

        elevation_path = os.path.join(PROCESSED_FOLDER, "elevation_data.npy")
        np.save(elevation_path, elevation)
        
        gy_grad, gx_grad = np.gradient(elevation)
        slope_map = np.arctan(np.sqrt(gx_grad**2 + gy_grad**2)) * 180 / np.pi
        
        slope_data_path = os.path.join(PROCESSED_FOLDER, "slope_data.npy")
        np.save(slope_data_path, slope_map)
        print("✅ Raw slope data saved to:", slope_data_path)

        slope_image_path = os.path.join(PROCESSED_FOLDER, "slope_map.png")
        max_display_angle = 90.0 
        slope_norm_for_display = np.uint8(np.clip((slope_map / max_display_angle) * 255.0, 0, 255))
        
        colored_slope = cv2.applyColorMap(slope_norm_for_display, cv2.COLORMAP_JET)
        Image.fromarray(slope_norm_for_display).save(slope_image_path)
        cv2.imwrite(os.path.join(PROCESSED_FOLDER, "slope_colormap.png"), colored_slope)

        print("✅ Slope map saved to:", slope_image_path)
        print(f"Slope min (actual): {slope_map.min():.2f}° Slope max (actual): {slope_map.max():.2f}°")

        num_pixels_gt_45 = np.sum(slope_map >= 45)
        total_pixels_in_map = slope_map.size
        percentage_gt_45 = (num_pixels_gt_45 / total_pixels_in_map) * 100 if total_pixels_in_map > 0 else 0
        print(f"DEBUG: Pixels with slope >= 45°: {num_pixels_gt_45} ({percentage_gt_45:.2f}%)")
        num_pixels_exact_45 = np.sum(slope_map == 45)
        print(f"DEBUG: Pixels with slope == 45°: {num_pixels_exact_45}")
        print(f"DEBUG: Max slope detected in raw data: {np.max(slope_map):.2f}°")


        slope_min_actual = np.min(slope_map)
        slope_max_actual = np.max(slope_map)
        
        if (slope_max_actual - slope_min_actual) > 1e-6:
            slope_norm_for_hazard = (slope_map - slope_min_actual) / (slope_max_actual - slope_min_actual)
        else:
            slope_norm_for_hazard = np.zeros_like(slope_map)

        low_thresh = np.percentile(slope_norm_for_hazard, 33)
        mid_thresh = np.percentile(slope_norm_for_hazard, 66)

        hazard_rgb = np.zeros((slope_map.shape[0], slope_map.shape[1], 3), dtype=np.uint8)
        hazard_rgb[slope_norm_for_hazard <= low_thresh] = [0, 255, 0] # Green (Safe)
        hazard_rgb[(slope_norm_for_hazard > low_thresh) & (slope_norm_for_hazard <= mid_thresh)] = [255, 255, 0] # Yellow (Moderate)
        hazard_rgb[slope_norm_for_hazard > mid_thresh] = [255, 0, 0] # Red (Danger)

        hazard_image_path = os.path.join(PROCESSED_FOLDER, "hazard_map.png")
        Image.fromarray(hazard_rgb).save(hazard_image_path)

        print("✅ Hazard map saved to:", hazard_image_path)
        print(f"ℹ️ Slope range: min = {slope_min_actual:.6f}, max = {slope_max_actual:.6f}")


        # --- Calculate Basic Terrain Statistics ---
        last_min_elevation = f"{np.min(elevation):.2f}"
        last_max_elevation = f"{np.max(elevation):.2f}"
        last_avg_slope = f"{np.mean(slope_map):.2f}°"
        
        total_pixels = hazard_rgb.shape[0] * hazard_rgb.shape[1]
        danger_pixels = np.sum(np.all(hazard_rgb == [255, 0, 0], axis=2))
        last_danger_area_percent = f"{(danger_pixels / total_pixels) * 100:.2f}%"

        print("✅ Basic Terrain Statistics Calculated:")
        print(f"   Min Elevation: {last_min_elevation}")
        print(f"   Max Elevation: {last_max_elevation}")
        print(f"   Average Slope: {last_avg_slope}")
        print(f"   Danger Area: {last_danger_area_percent}")

        # --- Calculate Advanced Terrain Statistics ---
        top_indices = np.argsort(elevation.ravel())[::-1]
        bottom_indices = np.argsort(elevation.ravel())

        last_top_points = []
        count_top = 0
        for idx in top_indices:
            y, x = np.unravel_index(idx, elevation.shape)
            if all(p['x'] != float(x) or p['z'] != float(y) for p in last_top_points):
                elevation_val = elevation[y, x]
                last_top_points.append({"x": float(x), "y_elev": float(elevation_val), "z": float(y)})
                count_top += 1
            if count_top >= 5: break

        last_bottom_points = []
        count_bottom = 0
        for idx in bottom_indices:
            y, x = np.unravel_index(idx, elevation.shape)
            if all(p['x'] != float(x) or p['z'] != float(y) for p in last_bottom_points):
                elevation_val = elevation[y, x]
                last_bottom_points.append({"x": float(x), "y_elev": float(elevation_val), "z": float(y)})
                count_bottom += 1
            if count_bottom >= 5: break
        
        print("✅ Top 5 Highest Points:", last_top_points)
        print("✅ Top 5 Lowest Points:", last_bottom_points)

        last_slope_distribution = {}
        total_pixels_map = slope_map.size

        slope_bins = [0, 5, 15, 30, 45, 90]
        bin_labels = ["0-5° (Very Low)", "5-15° (Low)", "15-30° (Moderate)", "30-45° (High)", ">45° (Critical)"]

        for i in range(len(bin_labels)): 
            lower_bound = slope_bins[i]
            
            if i < len(bin_labels) - 1:
                upper_bound = slope_bins[i+1]
                pixels_in_range = np.sum((slope_map >= lower_bound) & (slope_map < upper_bound))
            else:
                pixels_in_range = np.sum(slope_map >= lower_bound)
            
            percentage = (pixels_in_range / total_pixels_map) * 100 if total_pixels_map > 0 else 0
            last_slope_distribution[bin_labels[i]] = f"{percentage:.2f}%"

        print("✅ Slope Distribution:", last_slope_distribution)


        detected_zones = detect_landing_zones(hazard_image_path, min_area_pixels=500)
        last_landing_zones_data = []
        for zone in detected_zones:
            last_landing_zones_data.append({
                'bbox': zone['bbox'],
                'area_pixels': zone['area_pixels'],
                'center_pixel': zone['center_pixel']
            })
        print(f"Prepared {len(last_landing_zones_data)} landing zones for frontend.")


        mesh = elevation_to_mesh(elevation)
        mesh_path = os.path.join(PROCESSED_FOLDER, "lunar_terrain.obj")
        mesh.export(mesh_path)
        print("✅ Mesh saved to:", mesh_path)

        return redirect(url_for('viewer'))

    if last_original_image_filename and last_processed_image_filename:
        original_url = url_for('uploaded_file', filename=last_original_image_filename)
        processed_url = url_for('processed_file', filename=last_processed_image_filename)

    return render_template('upload.html',
                           original_url=original_url,
                           processed_url=processed_url,
                           normalization_enabled_checked=last_normalization_enabled,
                           denoising_enabled_checked=last_denoising_enabled,
                           exaggeration_enabled_checked=last_exaggeration_enabled)

@app.route('/viewer')
def viewer():
    global last_processed_image_filename
    
    processed_image_url = None
    if last_processed_image_filename:
        try:
            processed_image_url = url_for('processed_file', filename=last_processed_image_filename)
        except Exception as e:
            print(f"Error building processed_image_url: {e}. Resetting filename.")
            last_processed_image_filename = None
            processed_image_url = None
    
    return render_template('viewer.html',
                           processed_image_url=processed_image_url,
                           exaggeration_factor_applied=last_exaggeration_enabled,
                           min_elevation=last_min_elevation,
                           max_elevation=last_max_elevation,
                           avg_slope=last_avg_slope,
                           danger_area_percent=last_danger_area_percent,
                           top_points=last_top_points,
                           bottom_points=last_bottom_points,
                           slope_distribution=last_slope_distribution,
                           landing_zones=last_landing_zones_data,
                           image_width=last_image_width,
                           image_height=last_image_height)

@app.route('/processed/<filename>')
def processed_file(filename):
    return send_from_directory(PROCESSED_FOLDER, filename)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# FIX: Explicitly register the find_rover_path route here
# This ensures it's part of the URL map even with development server quirks
# Moved below all other route definitions to ensure app is fully initialized
@app.route('/find_rover_path', methods=['POST'])
def find_rover_path_route(): # Renamed the function to avoid clash if you had another 'find_rover_path' below
    data = request.json
    start_pixel = tuple(data['start_pixel'])
    end_pixel = tuple(data['end_pixel'])
    max_slope = float(data['max_slope'])
    
    elevation_path = os.path.join(PROCESSED_FOLDER, "elevation_data.npy")
    
    if not os.path.exists(elevation_path):
        return jsonify({"error": "Elevation data not found. Please process an image first."}), 400

    print(f"Finding path from {start_pixel} to {end_pixel} with max slope {max_slope}°")
    
    path_pixels = find_path(elevation_path, start_pixel, end_pixel, max_slope)
    
    if path_pixels:
        print(f"Path found with {len(path_pixels)} steps.")
        return jsonify({"path": path_pixels}), 200
    else:
        print("No path found.")
        return jsonify({"message": "No path found within given constraints."}), 200


if __name__ == '__main__':
    app.run(debug=True)