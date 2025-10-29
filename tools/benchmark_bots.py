"""
Quick benchmarking script for the project's bots.

Measures move-selection time (seconds) for each bot on a set of test positions.
Saves summary CSV to data/bench_results.csv and prints results to stdout.

Usage (from repo root):
    .env\Scripts\python.exe tools\benchmark_bots.py

Notes:
- External engines (stockfish/komodo) are invoked with very small depth/time limits to keep the benchmark fast.
- Adjust ITERATIONS and DEPTHS below to scale the experiment.
"""
import sys
import time
import csv
import os
from statistics import mean, median, stdev

sys.path.insert(0, r'd:/Repositories/Chess-Game-AI-Using-Python/src')

import ai
from board import Board

# Experiment parameters
ITERATIONS = 50  # per bot per position (reduce if slow)
POSITIONS = 5    # number of random positions generated from the initial position
RANDOM_MOVES = 8 # random plies to make to generate non-opening positions
OUT_CSV = os.path.join('data', 'bench_results.csv')

# Bots to benchmark and per-bot params (depth or randomness)
BOTS = [
    ('random', {}),
    ('minimax', {'depth': 2}),
    ('deepblue', {'depth': 3}),
    ('magnus', {'randomness': 0.0}),
    ('stockfish', {'depth': 1}),
    ('komodo', {'depth': 1}),
]

# create test positions: initial and some random plies
def gen_positions(n_positions, random_plies=8):
    positions = []
    b = Board()
    positions.append(b)
    import random
    for i in range(1, n_positions):
        tb = Board()
        # play random legal moves to create a midgame
        for j in range(random_plies):
            # get legal moves
            moves = ai.all_legal_moves(tb, 'white' if (j % 2 == 0) else 'black')
            if not moves:
                break
            m = random.choice(moves)
            piece = tb.squares[m.initial.row][m.initial.col].piece
            tb.move(piece, m)
            tb.set_true_en_passant(piece)
        positions.append(tb)
    return positions


def time_bot_on_position(bot_name, board, **kwargs):
    times = []
    for _ in range(ITERATIONS):
        t0 = time.perf_counter()
        try:
            m = ai.get_bot_move(board, 'white', engine=bot_name, depth=kwargs.get('depth', 2))
        except Exception:
            m = None
        t1 = time.perf_counter()
        times.append(t1 - t0)
    return times


def summarize(times):
    return {
        'count': len(times),
        'mean': mean(times),
        'median': median(times),
        'stdev': stdev(times) if len(times) > 1 else 0.0,
        'min': min(times),
        'max': max(times),
    }


def run():
    os.makedirs('data', exist_ok=True)
    positions = gen_positions(POSITIONS, RANDOM_MOVES)
    rows = []
    print('Benchmarking bots on', len(positions), 'positions with', ITERATIONS, 'iterations each...')
    for i, pos in enumerate(positions):
        print(f'Position {i+1}/{len(positions)}')
        for bot_name, params in BOTS:
            print('  ', bot_name, end=' -> ', flush=True)
            times = time_bot_on_position(bot_name, pos, **params)
            stats = summarize(times)
            print(f"mean {stats['mean']:.4f}s median {stats['median']:.4f}s max {stats['max']:.4f}s")
            rows.append({
                'position_index': i,
                'bot': bot_name,
                'iterations': stats['count'],
                'mean_s': stats['mean'],
                'median_s': stats['median'],
                'stdev_s': stats['stdev'],
                'min_s': stats['min'],
                'max_s': stats['max'],
            })
    # write CSV
    with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print('Saved results to', OUT_CSV)


if __name__ == '__main__':
    run()
