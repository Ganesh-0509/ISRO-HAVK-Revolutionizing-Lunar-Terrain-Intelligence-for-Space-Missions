import cv2
import numpy as np

def compute_gradients(input_path, grad_x_path, grad_y_path):
    # Load the preprocessed grayscale image and normalize to [0, 1] float
    img = cv2.imread(input_path, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255.0

    # Calculate gradients using Sobel operators directly
    # cv2.CV_32F ensures floating-point output for better precision,
    # which is crucial for reconstruction.
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=3) # Gradient in X direction
    gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=3) # Gradient in Y direction

    # Normalize gx and gy to 0-255 for saving as image for visualization/debugging.
    # The gradients can have negative values, so NORM_MINMAX scales them correctly.
    gx_norm = cv2.normalize(gx, None, 0, 255, cv2.NORM_MINMAX)
    gy_norm = cv2.normalize(gy, None, 0, 255, cv2.NORM_MINMAX)

    # Save the normalized gradient images (for debugging/visual inspection)
    cv2.imwrite(grad_x_path, gx_norm.astype(np.uint8))
    cv2.imwrite(grad_y_path, gy_norm.astype(np.uint8))

    print(f"Computed gradients. X-gradient saved to: {grad_x_path}, Y-gradient saved to: {grad_y_path}")

    # Return the actual float gradients for the reconstruction module
    return gx, gy