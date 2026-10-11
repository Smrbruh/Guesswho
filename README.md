# Угадай кто?

Настольная игра в браузере. Колоды: Атака титанов, Наруто, Гарри Поттер, Мстители.

## Запуск

1. Установите Python 3 (python.org), если его нет.
2. Windows: дважды щёлкните `start.bat`. macOS / Linux: `sh start.sh`.
   Скрипт скачает фото персонажей в `images/` (уже скачанные пропускаются) и откроет игру на http://localhost:8000/.

Вручную:

    python tools/download_images.py
    python serve.py

Двойной клик по `index.html` не сработает: браузеры блокируют загрузку `data/characters.json` и ES-модулей с `file://`.

## Структура

    index.html            разметка
    css/                  base, table, home, game, responsive
    js/                   main, state, constants, catalog, storage, dom, images, motion, toast, home, board, actions, events, photo
    data/characters.json  колоды и персонажи (name, img)
    assets/icons.svg      иконки и символы PlayStation
    images/               фото персонажей (после download_images.py)
    tools/                download_images.py, sources.json (ссылки на оригиналы)
    serve.py              локальный сервер

## Добавить свою колоду

Добавьте объект в `categories` в `data/characters.json`: `id`, `title`, `edition`, `hue` (0–360) и список `characters` с полями `name` и `img`. Пустой `img` даёт заглушку с инициалами, фото можно загрузить прямо в игре кнопкой «ЗАГРУЗИТЬ ФОТО».
