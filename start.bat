@echo off
chcp 65001 >nul
title ФайлыПро — магазин
cd /d "%~dp0"

rem На этом ПК в системе задан нерабочий прокси 127.0.0.1:10809.
rem Убираем его здесь, чтобы ИИ и оплата ходили напрямую.
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set ALL_PROXY=
set all_proxy=
set NODE_USE_ENV_PROXY=0

echo Запуск магазина: http://localhost:3000
node server.js
pause