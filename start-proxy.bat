@echo off
title Antigravity Claude Proxy
echo Starting Antigravity Claude Proxy...

:: Navigate to the directory where this script is located
cd /d "%~dp0"

:: check if node_modules exists, if not run npm install
if not exist node_modules (
    echo node_modules not found, installing dependencies...
    call npm install
)

:: Run the dev script
call npm run dev

:: Pause only if there was an error or forceful exit
if errorlevel 1 pause
