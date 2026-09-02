@echo off
title Enviar para o GitHub - Personal Shopper
echo =======================================================
echo  Enviando codigo para o GitHub com historico limpo:
echo  https://github.com/matheuslippe/Personal-Shopper
echo =======================================================
echo.
cd /d "%~dp0"
"C:\Program Files\Git\cmd\git.exe" push --force origin main
echo.
echo =======================================================
echo  Concluido! Pressione qualquer tecla para fechar.
echo =======================================================
pause
