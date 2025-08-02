import cv2
import os
import numpy as np # Import numpy for array manipulation if needed

def preprocess_image(input_path, output_path, normalize_hist=True, denoise=True):
    # Load image in grayscale
    img = cv2.imread(input_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Image not found at {input_path}")

    processed_img = img

    # Normalize brightness using Adaptive Histogram Equalization (CLAHE) (conditional)
    if normalize_hist:
        # Create a CLAHE object (Contrast Limited Adaptive Histogram Equalization)
        # clipLimit: Threshold for contrast limiting. Higher values give more contrast.
        # tileGridSize: Size of grid for histogram equalization.
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8)) # Common values, can be tuned
        processed_img = clahe.apply(processed_img)
        print("Pre-processing: Adaptive Histogram Equalization (CLAHE) Applied.")
    else:
        # If CLAHE is off, but standard equalizeHist was desired, you can add it here.
        # For now, if normalize_hist is False, no histogram equalization is applied.
        pass

    # Denoise using median blur (conditional)
    if denoise:
        processed_img = cv2.medianBlur(processed_img, 5) # Kernel size 5x5
        print("Pre-processing: Median Blur (Denoising) Applied.")

    # Save processed image
    cv2.imwrite(output_path, processed_img)
    print(f"Preprocessed image saved to: {output_path}")