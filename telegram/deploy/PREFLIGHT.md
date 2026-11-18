# Безопасная диагностика реального VPS

Это **не** installer/deploy. Скрипт не вызывает start/stop/restart/reload, не меняет Caddy/unit/env, не отправляет Telegram API-запросы и не вызывает API рабочих комнат. Записываются только новые приватные файлы диагностики/копии. Текущий результат этой сессии — [PREFLIGHT-STATUS.md](PREFLIGHT-STATUS.md).

## Подготовка пакета на Windows

Из чистого checkout нужного commit, используя Node 24:

```powershell
node telegram/build.cjs
node telegram/tests/native-runtime.cjs
node telegram/deploy/package-preflight.cjs
```

В игнорируемом `telegram/deploy/out/` появятся `manager-diagnostic-COMMIT.tar` и `diagnostic-release.json` с SHA-256. Пакет содержит только diagnostic scripts, native-кандидат общего сервера и его manifest. Env, токены, рабочие базы и player data туда не входят. Сам пакет не подключается к VPS.

Передайте архив и `diagnostic-release.json` в приватный `/root` через существующий SSH/SFTP/консоль провайдера. Пароль или ключ не отправлять в чат. Сверяйте SHA с доверенной локальной копией manifest; не полагаться на manifest от неизвестного отправителя.

## Запуск через консоль владельца

Требуются существующий `/opt/manager-node/bin/node` версии 24.22.1+ и root для чтения unit/proc/Caddy и защищённой SQLite. Дополнительно для **совместимости** нужен установленный `bwrap` и доступные Linux namespaces. Скрипт не устанавливает пакеты и не меняет kernel/AppArmor/firewall. При отсутствии/запрете sandbox результат NO-GO/BLOCKED, небезопасного fallback нет.

Подставьте имя переданного архива. Далее команды выполняются владельцем на Debian, не в PowerShell:

```sh
umask 077
mkdir -p /root/manager-preflight
tools=$(mktemp -d /root/manager-preflight/tools.XXXXXXXX)
/opt/manager-node/bin/node -e 'const fs=require("node:fs"),c=require("node:crypto"),m=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));if(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")!==m.sha256)process.exit(2);console.log("SHA256 PASS")' /root/manager-diagnostic-COMMIT.tar /root/diagnostic-release.json
```

**Только если SHA256 PASS**, распаковать проверенный архив в новый каталог и выполнить:

```sh
tar -xf /root/manager-diagnostic-COMMIT.tar -C "$tools" --no-same-owner
out=/root/manager-preflight/run-$(date -u +%Y%m%dT%H%M%SZ)
env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/root nice -n 10 /opt/manager-node/bin/node "$tools/preflight.cjs" --out "$out" --candidate "$tools/candidate-rooms.tar" --manifest "$tools/shared-release.json"
```

`/root/manager-preflight` должен принадлежать root и иметь 0700. Существующие каталоги/права скрипт не исправляет; при неожиданном владельце/правах останавливается. `run-*` должен быть новым, повторное использование отвергается. Код завершения 0 — диагностический GO, 2 — NO-GO/недоступная проверка. Даже GO **не является разрешением на развёртывание**.

## Фактические проверки

- Версии PATH Node и выделенного Node игры; actual process exe/cmdline/cwd, PID/active/enabled/user и unit SHA, текущий release и SHA server/engine. Process environment читается в памяти только для сверки ROOM_DATABASE; токены/полное env/сырые аргументы в отчёт не записываются.
- UID/GID/mode файлов и каталога БД; источник должен совпасть с настройкой и открытым fd процесса. Несовпадение не обходится предположением по порту. Порты 8080/8443/8444 проверяются по всем TCP-listeners, включая wildcard/IPv6. Состояния Caddy/Docker читаются, не меняются.
- Запас свободного места/RAM. Перед копией нужно более `5 × (DB+WAL) + 1 GiB` на diagnostic filesystem; для rollout фиксируется консервативный минимум 1 GiB свободного диска БД/512 MiB доступной RAM. Это критерии допуска, а не обещание производительности. При недостатке места копия не начинается; во время backup установлен дополнительный порог 512 MiB.
- Caddy: SHA/права, version, **adapt** на диске и GET активного admin config; сравнение в памяти. Проверяется candidate host block и неизменность чужих routes/settings через semantic guard. Никаких Caddy validate/provisioning/ACME/reload: они не нужны для диагностики и не выдаются за выполненные. Environment expansion, относительные file imports или недоступный admin endpoint требуют ручного разбора и дают NO-GO.
- Одна согласованная SQLite-копия через `node:sqlite.backup`, source `readOnly:true`, без checkpoint/смены journal mode/остановки writer. WAL учитывается SQLite API. Child ограничен 30 секундами; при постоянной нагрузке возможен timeout и частичная **новая** копия, которая не отмечается успешной. Рабочие записи скрипт не обновляет. Между live источником и snapshot новые ходы допустимы; не сравнивать их текущие хеши как доказательство отсутствия изменений.
- Integrity/foreign keys/schema/число записей/структура room JSON проверяются **на копии**. Восстановление только в новый изолированный файл, hash должен совпасть с backup. SQL/player content в отчёт не выводится.
- Candidate tar проверяется по SHA и строгим file types/paths. Для previous берётся **фактический** server.cjs/engine.cjs из действующего release; в отчёте их хеши. Это не frozen fixture и не предположение о версии по HTML.
- Оба runtime запускаются только внутри `bubblewrap`: отдельные mount/network/PID namespaces, очищенное environment, UID/GID 65534, capabilities сняты; production `/opt/manager-online`, `/var/lib/manager-online`, `/root` не монтируются. Worker сам проверяет отсутствие этих путей и внешних network interfaces. Ему доступны только runtime libraries и private working copies, listener использует случайный loopback-порт внутри namespace. Действующие 8080/8443/8444 не занимаются.
- На восстановленной БД проверяются startup/health и неизменность исторических `online_rooms`/`replay`. На двух **дополнительных копиях** — ответы previous/candidate для исторических комнат. В этих копиях заменён один hash ключа участника на тестовый, обновлены age/clock/lastSeen; сравниваются game/economy, revision и базовые образы. Настоящие ключи игроков не известны и не используются. Это проверка чтения исторических состояний, а не реальные ходы пользователей.
- Отдельная синтетическая партия в восстановленной БД: create/join/start/roll, upgrade, replay без повторного хода, новый ход, rollback прежнего кода, повтор нового replay и integrity. Только isolated DB. Исторические просроченные записи могут штатно очиститься **в копии** во время таких тестов; исходный snapshot сохраняется неизменным.
- В конце повторяются PID/active/current и свободность портов, хеши Caddy file/active config. Изменение другим администратором или автоперезапуск во время проверки даёт NO-GO.

Документация: [Node 24 SQLite backup](https://nodejs.org/download/release/v24.22.2/docs/api/sqlite.html), [официальный bubblewrap manual](https://github.com/containers/bubblewrap/blob/main/bwrap.xml). Online Backup может перезапускаться при записях из других соединений, поэтому отсутствие downtime не означает гарантированное время завершения.

## Что передать обратно

В `run-*` будут `REPORT.md`, `report.json`, `backup/rooms.sqlite`, backup manifest и изолированные восстановленные файлы. **Весь каталог приватный:** в нём реальные player data, игровые секреты и временная Caddy-конфигурация. Ничего из него не коммитить и не загружать в публичный GitHub/Actions artifacts.

Для следующего решения достаточно приватно передать `REPORT.md` и `report.json`. Они содержат статусы/хеши/счётчики/системные пути, без player names, room codes, bearer tokens и env. Если worker не стартовал, причина будет BLOCKED (`BWRAP_NOT_INSTALLED`, `BWRAP_DENIED_OR_WORKER_FAILED`, `SANDBOX_TIMEOUT`); если код/данные не прошли — FAIL с этапом проверки. Ничего не включать и не менять ради получения GO. Физические устройства, живые Telegram/Stars и отдельное разрешение rollout остаются вне этой диагностики.

## Ошибки совместимости и повтор команд

`compatibility.json`, `report.json` и итоговый stdout при FAIL содержат `stage`, точную `operation`, ожидаемый/фактический HTTP-статусы, нормализованный endpoint без кода комнаты, тип/размер ответа, признаки JSON/ошибки и разрешённый код серверной ошибки. Стек содержит только имена известных исходных файлов и координаты; цепочка `cause` ограничена глубиной. Тела ответов, headers, идентификаторы запросов, ключи, персональные данные, assertion diffs и содержимое БД не записываются. Известные постоянные сообщения протокола разрешены явно; неизвестные сообщения заменяются `[REDACTED_UNRECOGNIZED_MESSAGE]`. Исходные `Error`, `message`, `stack`, `cause` сохраняются в памяти без оборачивания общей ошибкой. Не отключать редактирование отчётов ради получения исходного текста.

Повтор первоначального броска после смены runtime сохраняет точные body, `requestId`, `Idempotency-Key`, ключ участника и прежний `gameRevision` — это проверка replay. Следующая новая команда получает свежие UUID, актуальный revision из GET и участника по текущей фазе. `ready` означает `roll`; отказ от покупки допустим независимо от стоимости участка. Следующий ход отделён этапом `FIXTURE_CANDIDATE_NEXT_ACTION` от собственно replay. Возврат к прежнему runtime повторяет ту же новую команду и проверяет отсутствие повторного действия.

Регрессионный тест на синтетической БД воспроизводит дефект старого worker: дубль 5+5 → обычное посещение «Биржи» → `ready`; прежняя таблица искала фазу `roll` и падала в `assert(method)`, ошибочно помечая это `FIXTURE_UPGRADE_REPLAY`. Новый worker проходит этот сценарий. Это подтверждённый дефект диагностики, **не доказанная причина старого сбоя VPS**: там сохранилась только общая метка, без статуса и первичного исключения. Повторный запуск исправленного пакета на реальной копии обязателен; NO-GO не снимается автоматически.
