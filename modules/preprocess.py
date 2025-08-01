import cv2
import os

def preprocess_image(input_path, output_path, normalize_hist=True, denoise=True):
    # Load image in grayscale
    img = cv2.imread(input_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Image not found at {input_path}")

    processed_img = img

    # Normalize brightness using histogram equalization (conditional)
    if normalize_hist:
        processed_img = cv2.equalizeHist(processed_img)
        print("Pre-processing: Histogram Equalization Applied.")

    # Denoise using median blur (conditional)
    if denoise:
        processed_img = cv2.medianBlur(processed_img, 5)
        print("Pre-processing: Median Blur (Denoising) Applied.")

    # Save processed image
    cv2.imwrite(output_path, processed_img)
    print(f"Preprocessed image saved to: {output_path}")