import sys
import os
sys.path.insert(0, r'd:/Repositories/Chess-Game-AI-Using-Python/src')

import ai
from board import Board

print('Loading Magnus book...')
book = ai.load_magnus_book()
print('Book loaded:', book is not None)

b = Board()
print('Initial board created')
move = ai.magnus_bot(b, 'white', randomness=0.0)
if move:
    print('Magnus suggested move UCI:', ai.move_to_uci(move))
    print('Move object:', move)
else:
    print('Magnus had no book move for the initial position')
