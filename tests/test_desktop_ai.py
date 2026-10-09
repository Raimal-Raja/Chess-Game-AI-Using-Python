"""Regression for the desktop AI's formerly inverted Black evaluation."""
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from board import Board
from piece import King, Rook, Queen
from ai import minimax_bot, deep_blue_bot

@pytest.mark.parametrize('color', ['white', 'black'])
@pytest.mark.parametrize('bot', [minimax_bot, deep_blue_bot])
def test_capture_evaluation_for_both_colors(color, bot):
    board=Board()
    for row in board.squares:
        for square in row: square.piece=None
    board.squares[7][7].piece=King('white')
    board.squares[0][7].piece=King('black')
    row=4 if color=='white' else 3
    board.squares[row][0].piece=Rook(color)
    board.squares[row][3].piece=Queen('black' if color=='white' else 'white')
    move=bot(board,color,depth=1)
    assert (move.final.row,move.final.col)==(row,3)
