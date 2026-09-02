@echo off
chcp 65001 >nul
echo =======================================================
echo  🛡️ Purga de Banco de Dados do Histórico Git (Fase 0)
echo =======================================================
echo.
echo ATENÇÃO: Este script reescreve o histórico do Git para
echo remover permanentemente dados/banco.db de todos os commits.
echo.
pause

echo 1. Instalando/verificando git-filter-repo via pip...
pip install git-filter-repo

echo 2. Executando git filter-repo...
git filter-repo --path dados/banco.db --path dados/banco.db-wal --path dados/banco.db-shm --invert-paths --force

echo 3. Reconfigurando origem remota...
git remote add origin https://github.com/matheuslippe/Personal-Shopper.git

echo.
echo =======================================================
echo ✔ Histórico limpo localmente!
echo Para atualizar o GitHub (force push), execute:
echo   git push origin --force --all
echo   git push origin --force --tags
echo =======================================================
pause
