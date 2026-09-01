@echo off
title Enviar para o GitHub - Personal Shopper
echo =======================================================
echo  Enviando codigo para o GitHub:
echo  https://github.com/matheuslippe/Personal-Shopper
echo =======================================================
echo.
cd /d "%~dp0"
git push -u origin main
echo.
echo =======================================================
echo  Concluido! Pressione qualquer tecla para fechar.
echo =======================================================
pause
