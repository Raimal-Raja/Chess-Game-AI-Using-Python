import pygame
import sys
import os

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

class Sound:

    def __init__(self, path):
        self.path = resource_path(path)
        self.sound = pygame.mixer.Sound(self.path)

    def play(self):
        pygame.mixer.Sound.play(self.sound)