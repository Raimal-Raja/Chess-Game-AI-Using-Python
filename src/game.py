import pygame

from const import *
from board import Board
from dragger import Dragger
from config import Config
from square import Square
from config import resource_path

class Game:

    def __init__(self):
        self.next_player = 'white'
        self.hovered_sqr = None
        self.board = Board()
        self.dragger = Dragger()
        self.config = Config()

    # blit methods

    def show_bg(self, surface):
        """Draw the board. Callers should compute a board origin (ox, oy) and square size (sq)
        and pass them via attributes on this Game instance: self._board_origin and self._sq.
        If not present, fall back to full-surface layout (legacy behavior).
        """
        theme = self.config.theme
        width, height = surface.get_size()
        # allow main loop to set self._sq and self._board_origin for precise layout
        if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
            sq = self._sq
            ox, oy = self._board_origin
        else:
            sq = min(width, height) // ROWS
            ox, oy = 0, 0

        for row in range(ROWS):
            for col in range(COLS):
                # color
                color = theme.bg.light if (row + col) % 2 == 0 else theme.bg.dark
                # rect
                rect = (int(ox + col * sq), int(oy + row * sq), int(sq), int(sq))
                # blit
                pygame.draw.rect(surface, color, rect)

                # row coordinates (left side)
                if col == 0:
                    coord_color = theme.bg.dark if row % 2 == 0 else theme.bg.light
                    lbl = self.config.font.render(str(ROWS-row), 1, coord_color)
                    lbl_pos = (int(ox + 5), int(oy + 5 + row * sq))
                    surface.blit(lbl, lbl_pos)

                # col coordinates (bottom)
                if row == ROWS - 1:
                    coord_color = theme.bg.dark if (row + col) % 2 == 0 else theme.bg.light
                    lbl = self.config.font.render(Square.get_alphacol(col), 1, coord_color)
                    lbl_pos = (int(ox + col * sq + sq - 20), int(oy + sq * ROWS - 20))
                    surface.blit(lbl, lbl_pos)

    def show_pieces(self, surface):
        # use layout values set by main loop
        if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
            sq = self._sq
            ox, oy = self._board_origin
        else:
            width, height = surface.get_size()
            sq = min(width, height) // ROWS
            ox, oy = 0, 0

        # choose texture size based on square size
        tex_size = max(16, int(sq * 0.8))

        for row in range(ROWS):
            for col in range(COLS):
                if self.board.squares[row][col].has_piece():
                    piece = self.board.squares[row][col].piece
                    # all pieces except dragger piece
                    if piece is not self.dragger.piece:
                        # try texture nearest to desired size; fall back to 80px if missing
                        piece.set_texture(size=tex_size)
                        try:
                            img = pygame.image.load(resource_path(piece.texture))
                        except Exception:
                            piece.set_texture(size=80)
                            img = pygame.image.load(resource_path(piece.texture))
                        img_center = (int(ox + col * sq + sq / 2), int(oy + row * sq + sq / 2))
                        piece.texture_rect = img.get_rect(center=img_center)
                        surface.blit(img, piece.texture_rect)

    def show_moves(self, surface):
        theme = self.config.theme
        if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
            sq = self._sq
            ox, oy = self._board_origin
        else:
            width, height = surface.get_size()
            sq = min(width, height) // ROWS
            ox, oy = 0, 0

        if self.dragger.dragging:
            piece = self.dragger.piece

            # loop all valid moves
            for move in piece.moves:
                # color
                color = theme.moves.light if (move.final.row + move.final.col) % 2 == 0 else theme.moves.dark
                # rect
                rect = (int(ox + move.final.col * sq), int(oy + move.final.row * sq), int(sq), int(sq))
                # blit
                pygame.draw.rect(surface, color, rect)

    def show_last_move(self, surface):
        theme = self.config.theme
        if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
            sq = self._sq
            ox, oy = self._board_origin
        else:
            width, height = surface.get_size()
            sq = min(width, height) // ROWS
            ox, oy = 0, 0

        if self.board.last_move:
            initial = self.board.last_move.initial
            final = self.board.last_move.final

            for pos in [initial, final]:
                color = theme.trace.light if (pos.row + pos.col) % 2 == 0 else theme.trace.dark
                rect = (int(ox + pos.col * sq), int(oy + pos.row * sq), int(sq), int(sq))
                pygame.draw.rect(surface, color, rect)

        # if either king is in check, highlight it (handled by board methods)
        # show check/highlight is done in show_status for clarity

    def show_hover(self, surface):
        if self.hovered_sqr:
            if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
                sq = self._sq
                ox, oy = self._board_origin
            else:
                width, height = surface.get_size()
                sq = min(width, height) // ROWS
                ox, oy = 0, 0
            color = (180, 180, 180)
            rect = (int(ox + self.hovered_sqr.col * sq), int(oy + self.hovered_sqr.row * sq), int(sq), int(sq))
            pygame.draw.rect(surface, color, rect, width=3)

    def show_move_field(self, surface):
        """Render the last move (e.g. e2e4) in the top-left corner."""
        # keep move field at top-left of the full window
        if self.board.last_move:
            initial = self.board.last_move.initial
            final = self.board.last_move.final
            s = f"{Square.get_alphacol(initial.col)}{ROWS-initial.row}{Square.get_alphacol(final.col)}{ROWS-final.row}"
            lbl = self.config.font.render(f"Last: {s}", 1, (0, 0, 0))
            surface.blit(lbl, (10, 10))

    def show_status(self, surface):
        """Render status messages like 'White in check' or 'Black checkmate' at the top-center."""
        width, height = surface.get_size()
        sq = min(width, height) // ROWS

        status = None

        if self.board.is_checkmate('white'):
            status = 'White is checkmated'
        elif self.board.is_checkmate('black'):
            status = 'Black is checkmated'
        elif self.board.is_in_check('white'):
            status = 'White is in check'
        elif self.board.is_in_check('black'):
            status = 'Black is in check'

        if status:
            lbl = self.config.font.render(status, 1, (200, 30, 30))
            # center top
            x = (width - lbl.get_width()) // 2
            surface.blit(lbl, (x, 10))

        # highlight king square if in check/checkmate
        # red for check, darker red if checkmate
        highlight_color = None
        if self.board.is_checkmate('white'):
            highlight_color = (150, 30, 30)
            king_color = 'white'
        elif self.board.is_checkmate('black'):
            highlight_color = (150, 30, 30)
            king_color = 'black'
        elif self.board.is_in_check('white'):
            highlight_color = (200, 30, 30)
            king_color = 'white'
        elif self.board.is_in_check('black'):
            highlight_color = (200, 30, 30)
            king_color = 'black'
        else:
            king_color = None

        if highlight_color and king_color:
            # find king square
            krow = kcol = None
            from piece import King
            for r in range(ROWS):
                for c in range(COLS):
                    if self.board.squares[r][c].has_piece():
                        p = self.board.squares[r][c].piece
                        if isinstance(p, King) and p.color == king_color:
                            krow, kcol = r, c
                            break
                if krow is not None:
                    break
            if krow is not None:
                # use layout if available
                if hasattr(self, '_sq') and hasattr(self, '_board_origin'):
                    sq = self._sq
                    ox, oy = self._board_origin
                else:
                    width, height = surface.get_size()
                    sq = min(width, height) // ROWS
                    ox, oy = 0, 0
                rect = (int(ox + kcol * sq), int(oy + krow * sq), int(sq), int(sq))
                try:
                    s = pygame.Surface((int(sq), int(sq)), pygame.SRCALPHA)
                    s.fill((*highlight_color, 90))
                    surface.blit(s, (int(ox + kcol * sq), int(oy + krow * sq)))
                    pygame.draw.rect(surface, (255, 0, 0), rect, width=3)
                except Exception:
                    pygame.draw.rect(surface, highlight_color, rect, width=3)

    # other methods

    def next_turn(self):
        self.next_player = 'white' if self.next_player == 'black' else 'black'

    def set_hover(self, row, col):
        self.hovered_sqr = self.board.squares[row][col]

    def change_theme(self):
        self.config.change_theme()

    def play_sound(self, captured=False):
        if captured:
            self.config.capture_sound.play()
        else:
            self.config.move_sound.play()

    def reset(self):
        self.__init__()