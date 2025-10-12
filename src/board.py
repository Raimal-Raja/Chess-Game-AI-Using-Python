from const import *

class Board:
    def __init__(self):
        self.squares = []
        pass
    
    def _create(self):
        self.squares = [[0,0,0,0,0,0,0,0]for col in range(COLS)]
    
    def _add_pieces(self,color):
        pass
    