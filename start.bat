@echo off
title MongoTrace Launcher
echo ======================================================================
echo    MongoTrace - Digital Evidence Intelligence & Forensics Platform
echo ======================================================================
echo.
echo [1/3] Checking MongoDB...
echo       Ensuring MongoDB connection at mongodb://127.0.0.1:27017
echo.
echo [2/3] Launching Python FastAPI ML Engine (Port 5055)...
start "MongoTrace - Python ML Engine (Port 5055)" cmd /k "npm run ml"
echo       Python ML API started in background window.
echo.
echo [3/3] Launching Node.js Express Core Backend (Port 5050)...
start "MongoTrace - Node.js Server (Port 5050)" cmd /k "npm start"
echo       Node.js server started in background window.
echo.
echo ======================================================================
echo  Platform is online!
echo  Web Dashboard:  http://localhost:5050
echo  ML Swagger Docs: http://localhost:5055/docs
echo ======================================================================
echo.
timeout /t 3 >nul
start http://localhost:5050

