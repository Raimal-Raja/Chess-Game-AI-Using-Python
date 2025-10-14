import os
import sys

def resource_path(relative_path):
    """Get the absolute path to resource, works for dev and for PyInstaller"""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        # In development, the base path is the current directory
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

# Example usage (assuming your assets are in 'assets' relative to the main project folder)
image_file = resource_path(os.path.join("assets", "image_name.png"))