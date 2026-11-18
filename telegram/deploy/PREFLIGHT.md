# Изолированная диагностика v2 — без развёртывания

Используйте только новый полный diagnostic bundle. Старый прямой вызов `preflight.cjs --candidate ...` больше не поддерживается и возвращает NO-GO. Существующий пакет на VPS автоматически не обновлялся.

После проверки SHA-256 нового diagnostic tar по доверенному локальному `diagnostic-release.json` распакуйте его в новый приватный root-owned каталог `/root/manager-preflight/v2`. Не смешивайте файлы разных пакетов. Родитель `/root/manager-preflight` должен уже иметь владельца root и режим 0700; launcher ничего не исправляет в существующих каталогах.

В новом пакете находятся оба архива `candidate-rooms.tar`, `candidate-adapter.tar`, общий `shared-release.json` и diagnostic scripts. Env, реальные базы и токены отсутствуют. Манифест должен происходить из доверенного источника: совпадение SHA с подменённым манифестом не подтверждает подлинность.

## Одна команда на Debian VPS

После передачи и распаковки проверенного **нового** пакета:

```sh
env -i PATH=/usr/bin:/bin HOME=/root /opt/manager-node/bin/node /root/manager-preflight/v2/preflight-launch.cjs
```

Никаких параметров apply/deploy нет. Код 0 означает диагностический GO; 2 означает NO-GO. Даже GO не разрешает развёртывание. Требуются Node 24.22.1+, Python 3, kernel с open_tree/mount_setattr (Linux 5.12+, x86_64/aarch64), bubblewrap, доступные user/mount/PID/network namespaces, `/usr/bin/caddy`, обычная Debian Unix SQLite WAL на локальной ext4/XFS/Btrfs/tmpfs. Скрипт не устанавливает зависимости и не меняет kernel/AppArmor/firewall. Одного успешного `unshare` недостаточно: реальные основной sandbox и отдельный worker проверяются при запуске. Отсутствие любой зависимости — NO-GO без обхода защиты.

Результат: новый `/root/manager-preflight/run-<уникальное имя>/REPORT.md` и `report.json`. Подкаталоги `work` и `control` приватные; в них копии игровых данных и снимок Caddy. Не публиковать каталог, БД или исходный control/inventory.json. Для разбора достаточно итоговых REPORT.md/report.json.

## Технические границы

1. Небольшой доверенный `preflight-launch.cjs` и `preflight-host.cjs` работают на хосте от root. Они читают systemctl show, proc metadata, выбранные поля docker inspect контейнера deploy-app-1 и HTTP GET активной конфигурации Caddy. Не вызывают setters, SQL, код кандидата, restart/reload или Telegram API. Запись bootstrap ограничена кодом созданием нового приватного каталога диагностики. Как любой привилегированный bootstrap, этот код должен быть доверенным и проверенным; ОС не защищает хост от произвольной подмены самого launcher.
2. Основной `preflight.cjs` запускается только через bubblewrap: отдельные user/mount/PID/network namespaces, UID 65534, capabilities=0, no-new-privileges. Он сам проверяет namespaces, read-only mount flags и отсутствие host sockets/внешних interfaces. Прямой запуск от root запрещён. Никаких D-Bus, Docker socket, host PID namespace или host network. Запуск systemctl/docker внутри этого контура не может управлять VPS. После подготовки копий основной процесс завершается с внутренним статусом COPIES_READY; это не GO. Bootstrap запускает второй, независимый sandbox совместимости, в который передаются только приватные копии, /usr и runtime. Рабочие каталоги и исходные DB/WAL/SHM descriptors ему недоступны. Итоговый GO формируется только после обоих процессов и повторного inventory.
3. Код действующего Manager, его каталог БД, Caddy и bundle примонтированы read-only. Доступ к рабочим файлам на запись запрещён ядром; writable только новый `/audit`, отдельный tmpfs `/tmp` и приватные /dev. У runtime нет capabilities для remount и доступа к mount namespace хоста.
4. Привилегированный минимальный Python FD broker создаёт detached clone mount каталога БД через open_tree/mount_setattr с RDONLY/NOSUID/NODEV/NOEXEC. Это не remount существующего mount VPS: clone не присоединяется к host tree. Broker открывает DB/WAL/SHM через этот read-only clone только O_RDONLY|O_NOFOLLOW|O_NOATIME и передаёт ровно три read-only дескриптора. Это позволяет читать БД другого service UID без выдачи основному процессу DAC/ptrace capabilities. Capture проверяет режим FD и ST_RDONLY исходного mount через fstatvfs; повторное открытие через /proc/self/fd также не даёт writable handle. Если kernel/CAP_SYS_ADMIN не позволяет detached clone — NO-GO без fallback. Ни исходная SQLite, ни исходные WAL/SHM не открываются SQLite API и не mmap-ятся на запись.
5. Python capture берёт неблокирующие POSIX read locks: общий DB shared range, Unix WAL DMS и WRITE/CKPT/RECOVER. Копируются DB и только подтверждённая часть WAL до mxFrame; SHM не копируется. Проверяются формат, две копии заголовка SHM, salt/commit metadata, inode/размер/mtime. Занятый lock, неизвестный формат, отсутствующие WAL/SHM, несогласованные заголовки, слишком большая БД, timeout — NO-GO, без fallback на обычный cp живой БД или SQLite source open.
6. SQLite Online Backup, recovery, integrity, foreign keys, JSON/schema, restore и обе версии приложения работают **только на приватных копиях**. Проверяется, что recovery копии действительно применил ожидаемые WAL frames и page count. Исторические строки сравниваются на копиях с синтетическими credentials/clock metadata. Сохраняются old→new→old replay и проверка следующего хода.
7. Оба tar проверяются до исполнения: SHA-256, version/commit/kind/roomsEnabled, обязательные файлы, строгие пути и типы файлов; запрещены links/devices/дубликаты/traversal/env/БД/неожиданные backend files. Adapter и rooms из извлечённых архивов запускаются вместе в дополнительном sandbox без production mounts: HMAC RPC, поддельный premium ticket, смешанная APK/Telegram HTTP-партия, replay при отказе адаптера, профиль/выбор после перезапуска. Настоящая Telegram identity в этом тесте не используется.
8. Caddy только адаптирует копию будущего config внутри изоляции: без provisioning/validate/reload/ACME. Bootstrap после завершения повторяет read-only inventory: PID/current/хеши кода/unit/drop-ins/Caddy disk+active config/службы/контейнер. Изменения другими администраторами дают NO-GO.

## Ограничения

- Это не гарантия нулевого влияния на задержки: чтение потребляет I/O/CPU, а краткие read locks задерживают SQLite writer/checkpointer. Номинальный лимит capture 1 секунда, subprocess 3 секунды; при перегрузке ОС это не hard real-time гарантия. Busy lock не ожидается и не повторяется. Общая диагностика ограничена 150 секундами.
- Поддерживается обычный Unix SQLite VFS с POSIX locks и существующим валидным WAL/SHM. NFS/FUSE/нестандартный VFS, exclusive locking или слишком большая БД требуют отдельного storage-level snapshot и остаются NO-GO. Не использовать immutable=1 для меняющейся исходной БД.
- Игра продолжает сама менять DB/WAL/SHM и данные между inventory. Запрет касается **записей диагностики**, а не естественного прогресса игроков. Byte-for-byte неизменность и atime/mtime/ctime всех трёх файлов доказывается в тесте с остановленным тестовым writer, без остановки VPS-служб.
- Нет защиты от вредоносного root на хосте, нарушения lock-протокола другими программами, ошибок ядра/оборудования. Нет автоматического доказательства работоспособности реального Telegram, Stars, AdsGram, физических Android/iOS или переключения production. Платежи, реклама и bot settings не меняются.

Основания протокола: [SQLite WAL format и locks](https://sqlite.org/walformat.html), [Unix VFS](https://www.sqlite.org/src/doc/trunk/src/os_unix.c), [bubblewrap](https://github.com/containers/bubblewrap). Статус фактических проверок — в PR №5 и PREFLIGHT-STATUS.md; наличие инструмента не означает GO реального VPS.
