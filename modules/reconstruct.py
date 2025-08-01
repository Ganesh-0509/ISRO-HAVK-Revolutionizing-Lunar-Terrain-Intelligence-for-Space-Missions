import cv2
import numpy as np
from scipy.fft import fft2, ifft2

# Modify to accept actual gradient arrays, not paths
def reconstruct_surface(grad_x_array, grad_y_array):
    # The input arrays are already the float gradients (gx, gy) from gradient.py.
    # No need to load from image paths or normalize from [0, 255] pixels.
    grad_x = grad_x_array
    grad_y = grad_y_array

    h, w = grad_x.shape

    # Compute divergence (approximates the Laplacian: ∂²z/∂x² + ∂²z/∂y²)
    # This calculates the difference between adjacent gradient values.
    fx = np.zeros_like(grad_x)
    fy = np.zeros_like(grad_y)

    # Calculate the change in grad_x along x-direction
    fx[:, :-1] = grad_x[:, :-1] - grad_x[:, 1:]
    # Calculate the change in grad_y along y-direction
    fy[:-1, :] = grad_y[:-1, :] - grad_y[1:, :]

    div = fx + fy

    # Solve Poisson equation using FFT
    # Create frequency grids for the Fourier transform
    yy, xx = np.meshgrid(np.arange(h), np.arange(w), indexing='ij')

    # Denominator for the Poisson equation in the frequency domain
    # This corresponds to the inverse of the Laplacian operator in FFT space.
    denom = (2 * np.cos(np.pi * xx / w) - 2) + (2 * np.cos(np.pi * yy / h) - 2)
    
    # Avoid division by zero for the DC component (0 frequency).
    # Setting it to 1 effectively makes its inverse 1, preventing NaN/infinity.
    # The DC component of the heightmap corresponds to its overall average height,
    # which is later handled by normalization anyway.
    denom[0, 0] = 1

    # Perform FFT on the divergence
    f_transform = fft2(div)
    
    # Divide in frequency domain
    # This is the core step for solving Poisson equation: inverse Laplacian(divergence)
    heightmap_fourier = f_transform / denom

    # Perform inverse FFT to get the heightmap in spatial domain
    # np.real is used because ifft2 can return complex numbers due to
    # floating point inaccuracies, but heightmap should be real.
    heightmap = np.real(ifft2(heightmap_fourier))

    # Normalize to [0, 1] for consistent scaling before exaggeration
    heightmap -= heightmap.min()
    heightmap /= heightmap.max()

    print(f"Surface reconstructed. Heightmap shape: {heightmap.shape}")

    return heightmap