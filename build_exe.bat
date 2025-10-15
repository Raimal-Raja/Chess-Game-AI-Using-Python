@echo off
echo ========================================
echo   Chess Game EXE Builder
echo ========================================
echo.

echo Step 1: Installing PyInstaller...
pip install pyinstaller
echo.

echo Step 2: Cleaning previous builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo.

echo Step 3: Building executable...
pyinstaller chess_game.spec
echo.

echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Your executable is located at:
echo dist\ChessGame.exe
echo.
pause