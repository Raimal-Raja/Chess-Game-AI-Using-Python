import pygame

class Button:
    def __init__(self, rect, text, font, bg=(200,200,200), fg=(0,0,0)):
        self.rect = pygame.Rect(rect)
        self.text = text
        self.font = font
        self.bg = bg
        self.fg = fg

    def draw(self, surface):
        pygame.draw.rect(surface, self.bg, self.rect)
        lbl = self.font.render(self.text, True, self.fg)
        lbl_rect = lbl.get_rect(center=self.rect.center)
        surface.blit(lbl, lbl_rect)

    def is_clicked(self, pos):
        return self.rect.collidepoint(pos)

class BotSelector(Button):
    """A button that cycles through engine options when clicked."""
    def __init__(self, rect, label, font, options):
        super().__init__(rect, label, font)
        self.options = options
        self.idx = 0
        self.update_label(label)

    def update_label(self, label_base):
        self.text = f"{label_base}: {self.options[self.idx]}"

    def click(self):
        self.idx = (self.idx + 1) % len(self.options)
        self.update_label(self.text.split(':')[0])

    def current(self):
        return self.options[self.idx]


class Slider:
    """Horizontal slider control.

    rect: (x,y,w,h)
    min, max: integer range
    value: current int value
    """
    def __init__(self, rect, min_v=1, max_v=4, value=2, font=None):
        self.rect = pygame.Rect(rect)
        self.min = min_v
        self.max = max_v
        self.value = max(min(value, max_v), min_v)
        self.font = font
        self.dragging = False

    def draw(self, surface):
        # track
        track_rect = pygame.Rect(self.rect.x, self.rect.y + self.rect.h//2 - 4, self.rect.w, 8)
        pygame.draw.rect(surface, (200,200,200), track_rect)
        # knob position
        t = (self.value - self.min) / (self.max - self.min) if self.max > self.min else 0
        knob_x = int(self.rect.x + t * self.rect.w)
        knob_rect = pygame.Rect(knob_x - 6, self.rect.y + 2, 12, self.rect.h - 4)
        pygame.draw.rect(surface, (120,120,120), knob_rect)
        # label
        if self.font:
            lbl = self.font.render(f"Depth: {self.value}", True, (0,0,0))
            surface.blit(lbl, (self.rect.x, self.rect.y - 20))

    def is_clicked(self, pos):
        return self.rect.collidepoint(pos)

    def handle_event(self, event):
        # returns True if event handled
        if event.type == pygame.MOUSEBUTTONDOWN:
            if self.is_clicked(event.pos):
                self.dragging = True
                self._update_value_from_pos(event.pos)
                return True
        elif event.type == pygame.MOUSEMOTION:
            if self.dragging:
                self._update_value_from_pos(event.pos)
                return True
        elif event.type == pygame.MOUSEBUTTONUP:
            if self.dragging:
                self.dragging = False
                return True
        return False

    def _update_value_from_pos(self, pos):
        t = (pos[0] - self.rect.x) / max(self.rect.w, 1)
        t = max(0.0, min(1.0, t))
        v = round(self.min + t * (self.max - self.min))
        self.value = int(v)
 