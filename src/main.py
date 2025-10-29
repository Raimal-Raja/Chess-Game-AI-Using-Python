import pygame
import sys
import os

from const import *
from game import Game
from square import Square
from move import Move
import threading
import queue
import copy

class Main:

    def __init__(self):
        pygame.init()
        # make window resizable so minimize/maximize work
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
        pygame.display.set_caption('Chess')
        
        # Load and set window icon
        icon_path = os.path.join('assets', 'icon.png')
        if os.path.exists(icon_path):
            icon_image = pygame.image.load(icon_path)
            pygame.display.set_icon(icon_image)
        else:
            print(f"Warning: Icon file not found at {icon_path}")

        self.game = Game()
        # UI: bot selectors and reset
        self.font = pygame.font.SysFont('monospace', 16, bold=True)
        from ui import BotSelector, Button
        options = ['human', 'random', 'minimax', 'deepblue', 'magnus', 'komodo', 'stockfish']
        # place selectors top-right
        w, h = self.screen.get_size()
        # Sidebar will host these; initialize with placeholder positions
        self.white_bot_btn = BotSelector((w-210, 60, 180, 30), 'White', self.font, options)
        self.black_bot_btn = BotSelector((w-210, 110, 180, 30), 'Black', self.font, options)
        self.reset_btn = Button((w-210, 160, 180, 30), 'Reset', self.font, bg=(220,180,180))
        # engine state
        self.white_engine = 'human'
        self.black_engine = 'human'
        # settings sidebar state
        self.show_sidebar = False
        self.sidebar_width = 220
        # small settings toggle button (visible when sidebar closed)
        self.settings_btn = Button((w-40, 10, 30, 30), 'S', self.font, bg=(180,200,220))
        # engine background thread queue
        self.engine_queue = queue.Queue()
        self.engine_thread = None
        self.engine_thread_running = False
        self.engine_side = None
        # minimax depth (kept internal, slider removed for smoother UI)
        self.minimax_depth = 2
        # start background load of Magnus opening book if present (non-blocking)
        try:
            import ai as _ai
            tbook = threading.Thread(target=_ai.load_magnus_book, daemon=True)
            tbook.start()
        except Exception:
            # safe to ignore if loader not available
            pass

    def mainloop(self):
        
        screen = self.screen
        game = self.game
        board = self.game.board
        dragger = self.game.dragger

        while True:
            # compute layout: reserve sidebar area if visible and compute square size & origin
            w, h = screen.get_size()
            avail_w = w - (self.sidebar_width if self.show_sidebar else 0)
            board_size = min(avail_w, h)
            # square size (float for smoother scaling)
            sq = board_size / ROWS
            # center board horizontally within available area and vertically
            board_origin_x = int((avail_w - board_size) / 2)
            board_origin_y = int((h - board_size) / 2)
            # if sidebar is visible, it sits at the right edge of the window
            sidebar_x = int(board_origin_x + board_size)

            # provide layout to game drawing routines
            game._sq = sq
            game._board_origin = (board_origin_x, board_origin_y)

            # show methods (they use game._sq and game._board_origin)
            game.show_bg(screen)
            game.show_last_move(screen)
            game.show_moves(screen)
            game.show_pieces(screen)
            game.show_hover(screen)
            # UI draw: settings toggle or sidebar
            # w,h already computed above; sidebar_x computed above
            if self.show_sidebar:
                # draw sidebar background to the right of the board
                pygame.draw.rect(screen, (240,240,240), (sidebar_x, 0, self.sidebar_width, h))
                # position buttons inside sidebar
                self.white_bot_btn.rect.topleft = (sidebar_x + 15, 60)
                self.black_bot_btn.rect.topleft = (sidebar_x + 15, 110)
                self.reset_btn.rect.topleft = (sidebar_x + 15, 160)
                # draw labels
                title_lbl = self.font.render('Settings', True, (20,20,20))
                screen.blit(title_lbl, (sidebar_x + 15, 20))
                # draw controls
                self.white_bot_btn.draw(screen)
                self.black_bot_btn.draw(screen)
                self.reset_btn.draw(screen)
                # note: depth slider removed for smoother UI
            else:
                # small settings button in top-right
                self.settings_btn.rect.topleft = (w-40, 10)
                self.settings_btn.draw(screen)
            # show move field and status (top overlays)
            game.show_move_field(screen)
            game.show_status(screen)

            if dragger.dragging:
                dragger.update_blit(screen)

            for event in pygame.event.get():

                # window resized (allow maximize/minimize and re-layout)
                if event.type == pygame.VIDEORESIZE:
                    # recreate screen surface with new size
                    self.screen = pygame.display.set_mode((event.w, event.h), pygame.RESIZABLE)
                    screen = self.screen
                    # reposition settings button
                    w, h = screen.get_size()
                    self.settings_btn.rect.topleft = (w-40, 10)
                    continue

                # click
                if event.type == pygame.MOUSEBUTTONDOWN:
                    # settings button / sidebar interactions
                    if self.show_sidebar:
                        if self.white_bot_btn.is_clicked(event.pos):
                            self.white_bot_btn.click()
                            self.white_engine = self.white_bot_btn.current()
                            continue
                        if self.black_bot_btn.is_clicked(event.pos):
                            self.black_bot_btn.click()
                            self.black_engine = self.black_bot_btn.current()
                            continue
                        if self.reset_btn.is_clicked(event.pos):
                            game.reset()
                            game = self.game
                            board = self.game.board
                            dragger = self.game.dragger
                            continue
                        # (depth slider removed)
                        pass
                    else:
                        if self.settings_btn.is_clicked(event.pos):
                            # open sidebar
                            self.show_sidebar = True
                            continue

                    # now board interaction
                    # adjust mouse coords to board origin & square size
                    mx, my = event.pos
                    # convert screen coords to board-local coords
                    bx = mx - board_origin_x
                    by = my - board_origin_y
                    # update mouse for dragger with original screen pos (for blit)
                    dragger.update_mouse(event.pos)

                    try:
                        clicked_row = int(by // sq)
                        clicked_col = int(bx // sq)
                    except Exception:
                        clicked_row = clicked_col = -1

                    # if clicked square has a piece ?
                    if 0 <= clicked_row < ROWS and 0 <= clicked_col < COLS and board.squares[clicked_row][clicked_col].has_piece():
                        piece = board.squares[clicked_row][clicked_col].piece
                        # valid piece (color) ?
                        if piece.color == game.next_player:
                            board.calc_moves(piece, clicked_row, clicked_col, bool=True)
                            dragger.save_initial_rc(clicked_row, clicked_col)
                            dragger.drag_piece(piece)
                            # show methods 
                            game.show_bg(screen)
                            game.show_last_move(screen)
                            game.show_moves(screen)
                            game.show_pieces(screen)
                
                # mouse motion
                elif event.type == pygame.MOUSEMOTION:
                    # compute motion square relative to board origin and sq
                    mx, my = event.pos
                    bx = mx - board_origin_x
                    by = my - board_origin_y
                    try:
                        motion_row = int(by // sq)
                        motion_col = int(bx // sq)
                    except Exception:
                        motion_row = motion_col = -1

                    if 0 <= motion_row < ROWS and 0 <= motion_col < COLS:
                        game.set_hover(motion_row, motion_col)

                    if dragger.dragging:
                        dragger.update_mouse(event.pos)
                        # show methods
                        game.show_bg(screen)
                        game.show_last_move(screen)
                        game.show_moves(screen)
                        game.show_pieces(screen)
                        game.show_hover(screen)
                        dragger.update_blit(screen)
                
                # click release
                elif event.type == pygame.MOUSEBUTTONUP:
                    
                    if dragger.dragging:
                        dragger.update_mouse(event.pos)
                        # compute released square relative to board origin
                        mx, my = event.pos
                        bx = mx - board_origin_x
                        by = my - board_origin_y
                        try:
                            released_row = int(by // sq)
                            released_col = int(bx // sq)
                        except Exception:
                            released_row = released_col = -1

                        # create possible move
                        initial = Square(dragger.initial_row, dragger.initial_col)
                        final = Square(released_row, released_col)
                        move = Move(initial, final)

                        # valid move ?
                        if board.valid_move(dragger.piece, move):
                            # normal capture
                            captured = board.squares[released_row][released_col].has_piece()
                            board.move(dragger.piece, move)

                            board.set_true_en_passant(dragger.piece)                            

                            # sounds
                            game.play_sound(captured)
                            # show methods
                            game.show_bg(screen)
                            game.show_last_move(screen)
                            game.show_pieces(screen)
                            # next turn
                            game.next_turn()
                    
                    dragger.undrag_piece()
                    # allow closing sidebar by clicking outside
                    if self.show_sidebar:
                        # if click is outside sidebar area, close it
                        w, h = screen.get_size()
                        avail_w = w - self.sidebar_width
                        # if click is inside board area, keep sidebar open; otherwise close
                        if event.pos[0] < avail_w:
                            self.show_sidebar = False
                # slider mouse motion while dragging (slider removed)
                # we still allow hover updates to update visual state
                if self.show_sidebar and event.type == pygame.MOUSEMOTION:
                    pass
                
                # key press
                elif event.type == pygame.KEYDOWN:
                    
                    # changing themes
                    if event.key == pygame.K_t:
                        game.change_theme()

                    # reset game
                    if event.key == pygame.K_r:
                        game.reset()
                        game = self.game
                        board = self.game.board
                        dragger = self.game.dragger

                # quit application
                elif event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
            # if it's engine's turn, call its move
            # Engine scheduling: run engine move once in background thread and place result in engine_queue
            from ai import get_bot_move

            def engine_worker(board_copy, color, engine_name, depth):
                m = get_bot_move(board_copy, color, engine=engine_name, depth=depth)
                # Only enqueue the computed move; do not toggle engine flags here.
                # The main loop will clear the running flag after the move is applied
                self.engine_queue.put((color, m))

            # start worker if engine turn and not already running
            if game.next_player == 'white' and self.white_engine != 'human' and not self.engine_thread_running:
                self.engine_thread_running = True
                self.engine_side = 'white'
                # create a deep copy so the engine computes on a stable snapshot
                bcopy = copy.deepcopy(board)
                t = threading.Thread(target=engine_worker, args=(bcopy, 'white', self.white_engine, self.minimax_depth), daemon=True)
                t.start()

            if game.next_player == 'black' and self.black_engine != 'human' and not self.engine_thread_running:
                self.engine_thread_running = True
                self.engine_side = 'black'
                bcopy = copy.deepcopy(board)
                t = threading.Thread(target=engine_worker, args=(bcopy, 'black', self.black_engine, self.minimax_depth), daemon=True)
                t.start()

            # apply any completed engine move
            try:
                # Only get one move at a time, with a minimum delay between moves
                if not hasattr(self, 'last_move_time'):
                    self.last_move_time = 0
                
                current_time = pygame.time.get_ticks()
                # Enforce a minimum 1 second delay between moves
                if current_time - self.last_move_time >= 1000:  # 1000ms = 1 second
                    color, move = self.engine_queue.get_nowait()
                    if move:
                        piece = board.squares[move.initial.row][move.initial.col].piece
                        captured = board.squares[move.final.row][move.final.col].has_piece()
                        board.move(piece, move)
                        board.set_true_en_passant(piece)
                        game.play_sound(captured)
                        game.next_turn()
                        # mark engine worker as finished so a new one can be started on the next engine turn
                        self.engine_thread_running = False
                        self.engine_side = None
                        self.last_move_time = current_time
            except queue.Empty:
                pass

            pygame.display.update()


main = Main()
main.mainloop()