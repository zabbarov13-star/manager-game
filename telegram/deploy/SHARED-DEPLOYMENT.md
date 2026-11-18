# Реализованное разделение и безопасное обновление

18.11.2026. Реализация в PR №5, **на VPS ничего не применено**. Этот документ заменяет автономный `vps.cjs apply` для найденной `manager-online.service`.

## Что реализовано

- `TELEGRAM_MODE=adapter`: `telegram/server.cjs` не создаёт/не открывает комнаты; прямой `/api/rooms` возвращает 503 с сообщением об ошибке маршрутизации. Health явно сообщает `mode=adapter`, `roomsEnabled=false`. В CLI публичный listener строго `127.0.0.1:8443`, приватный — `127.0.0.1:8444`.
- Существующий `online/server.cjs` и служба/порт 8080 остаются единственным room writer. `ROOM_EXTENSION=telegram` включает дополнительный engine/проверку косметики; без настройки сохраняется прежний engine и поведение. Схема SQLite, токены, SHA/signature и шифрование replay не изменены; тело команды не переписывается.
- Адмит create/join/appearance и повторная проверка ожидающих игроков перед start: подписанный HMAC RPC, отдельный ключ, время/nonce, защита от повтора; ответ также подписан и привязан к nonce запроса. Таймаут 700 мс, максимум 32 ожидающих проверки. Проверка работает до игровой очереди и `BEGIN IMMEDIATE`. При смене room revision во время start ответ 409, а не запуск по устаревшему снимку.
- Клиентские flags/внутренние headers не являются доказательством прав. Новая недействительная косметика → 403, недоступный verifier → 503 с повтором. Старые команды без косметики и уже подтверждённые replay не требуют RPC. Текущая партия не теряет допущенный образ при истечении прав или рестарте адаптера.
- `telegram/shared/build.cjs` собирает server-only расширение отдельно. Исходный APK/Web HTML не подменяется Telegram-страницей. Общий engine не выполняет initData/Stars/AdsGram.
- Защищённый Caddy host: `/api/rooms` и `/api/rooms/*` → 8080, остальные публичные пути → 8443; `/internal`, `/admin`, `/api/internal`, `/api/admin` с подмаршрутами → 404 **до upstream**. Внутренний `/ads/verified-receipt` также закрыт на Caddy и adapter listener. RPC 8444 не включается ни в один публичный reverse_proxy. На основном адаптере private/admin также всегда 404.

## Локальная подготовка (не меняет VPS)

Из чистого checkout текущего commit, Node 24.22.1+:

```sh
node telegram/build.cjs
node telegram/tests/native-runtime.cjs
node telegram/deploy/shared-env.cjs
```

`native-runtime.cjs` создаёт и распаковывает два настоящих архива, запускает их в изолированном временном каталоге, проверяет UI/health. `telegram/deploy/out/shared-release.json` содержит commit и SHA-256 обоих архивов:

- `manager-rooms-COMMIT.tar`: существующий сервер, неизменённые APK/Web assets и необязательное расширение, **без Store/финансовых модулей**;
- `manager-adapter-COMMIT.tar`: профиль/авторизация/монетизация/интерфейс, **без rooms.cjs и room engine**. Неправильный standalone-режим такого пакета завершится отказом, а не запустит вторые комнаты.

Игнорируемые `out/adapter.env` и `out/cosmetics.env` — приватные файлы с одним новым RPC-ключом. Исходный `.env` не меняется. Повторный запуск отказывается молча перезаписывать/ротировать существующие файлы. Игровому серверу передаётся **только** cosmetics.env, без bot token/owner/payment secrets. Не загружать env в GitHub/artifacts; передавать защищённо. TELEGRAM_ENV/личность бота не выводить из его имени.

## Что проверить на VPS до разрешения переключения

Сведения о путях/службе получены от владельца. Прямого доступа и реальной копии БД в этой рабочей среде нет.

1. Сверить current target, SHA-256 server/engine, unit/drop-ins, `ROOM_DATABASE`, права и фактический Node SQLite. Сохранить конфигурации приватно. Проверить порты 8443/8444, RAM/диск, пользователя адаптера и доступ к выделенному Node. Не обновлять общий Node/Docker/Caddy.
2. В отдельном каталоге восстановить предоставленную `rooms-before-update.sqlite`; проверить фактическую схему и партии новым и прежним runtime. Локальный синтетический fixture не доказывает совместимость неизвестных VPS-файлов.
3. Проверить старые backup timers/пути. Если timer исполняет `current/online/vps/backup.sh`, сохранить **существующую доверенную** версию скрипта/права при подготовке release, не заменять root-executable неизвестным содержимым артефакта вслепую.
4. Получить точный diff действующего Caddy: disk и active config должны совпасть. Не менять существующие host routes. Реальный общий Caddy может иметь необычные matchers/imports: semantic guard должен пройти, иначе остановиться для адресной адаптации.

## Применение только после отдельного разрешения

Здесь инструкция, а не уже выполненные действия. Старые `telegram/deploy/vps.cjs apply` и выделенный staging Compose **не использовать** для этой инфраструктуры.

1. Передать проверенные архивы и приватные env, сверить SHA-256 с утверждённым manifest. Распаковать в **новые** release directories, без перезаписи current. Не копировать в рабочую SQLite и не создавать второй room DB.
2. Подготовить отдельного пользователя `manager-telegram`, `/var/lib/manager-telegram` с правами только ему, `/etc/manager-telegram/adapter.env` root:root 0600, `/etc/manager-online/cosmetics.env` root:root 0600. Systemd читает EnvironmentFile до понижения привилегий. Пример отдельной службы — `manager-telegram.service`: существующий `/opt/manager-node/bin/node`, каталог `/opt/manager-telegram/current`, read/write только профильной БД. Наличие этих путей/свободность имени проверить заранее. RPC-ключ на обеих сторонах должен совпадать.
3. Запустить только адаптер; проверить loopback health, отсутствие `rooms.sqlite`, приватный RPC и отказ на публичном private path. Проверить логи без env/токенов. Stars/Ads остаются OFF фиксированной конфигурацией службы.
4. В согласованное короткое окно остановить **только** `manager-online.service`, убедиться в отсутствии другого writer, сделать свежий SQLite backup и пробное восстановление. Существующую копию не перезаписывать. Не копировать один живой `.sqlite` без WAL через обычный cp.
5. Сохранить прежний release/current и env; поставить reviewed drop-in `manager-online-telegram.conf`. Он добавляет только расширение/RPC, не меняет ExecStart/User/порт/ROOM_DATABASE. Атомарно переключить current на новый room release, запустить ту же службу. Проверить 8080, старый HTTPS, существующую согласованную тестовую комнату/токены/replay. При ошибке — откат кода ниже.
6. Сгенерировать **новый host block**, не весь Caddyfile:

```sh
node -e "process.stdout.write(require('./telegram/deploy/shared-routing.cjs').sharedSite('manager.95-181-169-84.sslip.io'))"
```

Адаптировать прежнюю и candidate-конфигурации через установленный Caddy; передать JSON в `verifySharedChange(before,after,domain)`. Он сравнивает конфигурацию вне точного Telegram host matcher и проверяет порядок deny/rooms/adapter. После успешного guard и `caddy validate` выполнить только reload. Не разрешать proxy на 8444 и не менять «Смайлокрут»/18080/старый origin.

7. Проверить доверенный HTTPS, маршруты двух origins, старый APK, Mini App и «Смайлокрут». Для Main Mini App/webhook/команд сначала подтвердить среду/личность @ManagerGameTestBot и отдельно согласовать изменения бота. Реальные платежи/возвраты не входят в разрешение на серверный rollout.

## Копия и изолированное восстановление

Инструмент использует SQLite online backup API для двух **разных путей**, с integrity/hash manifest. Копии независимые; для согласованной точки остановить оба writer в утверждённое окно. Запускать с необходимыми правами администратора, не выдавать адаптеру доступ к room DB:

```sh
/opt/manager-node/bin/node /opt/manager-telegram/current/telegram/shared/backup.cjs snapshot --rooms /var/lib/manager-online/rooms.sqlite --telegram /var/lib/manager-telegram/telegram.sqlite --out /root/manager-backups/NEW_SNAPSHOT
/opt/manager-node/bin/node /opt/manager-telegram/current/telegram/shared/backup.cjs restore /root/manager-backups/NEW_SNAPSHOT /root/manager-backups/NEW_RESTORE_CHECK
```

Existing output/destination отвергаются. Восстановленные файлы открывать только в изолированном контуре; рабочие БД автоматически не заменять. Установить расписание, защищённую внешнюю копию и мониторинг ошибок/места после утверждения путей. Никакого удаления томов/prune.

## Откат кода

1. При проблеме только адаптера откатить/остановить только его службу и новый host route. Общий сервер продолжает обычные ходы; новые premium-запросы временно получают 503.
2. Для отката общего сервера остановить только `manager-online.service`, вернуть сохранённый symlink и drop-in/env, запустить прежний runtime с **текущей** `/var/lib/manager-online/rooms.sqlite`. Схема/replay не менялись; локальный тест запускает замороженный исходный `online/server.cjs` из commit fddd6d5 и прежний engine после работы нового кода.
3. Не восстанавливать старую SQLite поверх новых ходов/платежей автоматически. Если проблема в данных — сохранить текущие SQLite/WAL/SHM, согласовать отдельный recovery и возможную потерю новых действий. Caddy откатывать только в части нашего host, если конфигурация не изменена другим администратором.
4. Проверить room state, токены, оба origins, replay без двойного действия и «Смайлокрут». Успешный реальный rollback пока не подтверждён — проверены изолированные fixtures.

## Проверенные сценарии и оставшиеся препятствия

Локально PASS: adapter без room DB; настоящий HMAC RPC; подделка/повтор/неподписанный ответ/таймаут; APK-протокол+Telegram-профиль в одной партии; premium на start; отсутствие write-lock/блокировки очереди во время ожидания; 409 на гонке revision; отказ RPC без остановки партии/replay; рестарт адаптера; snapshot/restore раздельных БД с сохранением выбора и комнат; настоящий исходный HTTP-код после отката. Браузер PASS: desktop Chrome с APK HTML и мобильная ширина Mini App, create/join/ready/start/roll/reload, изображение Миры, без JS errors (`qa-results/shared-browser.json`). Telegram identity — подписанный fixture.

CI дополнительно проверяет native archives, shared integration внутри read-only/no-network контейнера и **реальный** Caddy adapt/validate/маршрутизацию, включая недоступность private paths до upstream. Состояние последнего прогона указывается в PR, а не предполагается по наличию теста.

BLOCKED перед безопасным развёртыванием: фактические хеши/unit/env/Caddy/порты и восстановление **реальной** копии VPS; отдельное разрешение на rollout/restart/reload; живой Telegram-клиент/бот/официальный тестовый Stars-поток; физический APK/WebView и iOS/мобильные сети. Существующий внешний PeerJS тест двух новых клиентов не заменяет физическую смешанную P2P-партию со старым APK. AdsGram OFF до доверенного provider event; реальные платежи не выполнялись.
