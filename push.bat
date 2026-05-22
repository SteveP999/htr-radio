@echo off
cd /d D:\htr-radio
git add .
git commit -m "Initial-HTR-Radio-build"
git branch -M main
git push -u origin main
if %errorlevel% equ 0 (echo SUCCESS - now enable GitHub Pages) else (echo ERROR - check output)
pause
