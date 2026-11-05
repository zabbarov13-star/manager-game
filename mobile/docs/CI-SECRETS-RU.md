# Автоматические APK и IPA

Мобильная ветка: https://github.com/zabbarov13-star/manager-game/tree/mobile/release-0.19 . Рабочая HTML-версия и PeerServer не заменяются. Workflow: .github/workflows/mobile-build.yml.

## Что уже автоматизировано

- Подготовка одной и той же игры из проверенной 0.18.3, со встроенными ресурсами.
- Проверки правил и модели P2P.
- Сборка simulator .app и неподписанного device-архива на macOS runner.
- Установка и запуск в iPhone/iPad Simulator, проверка HTML и сохранения при повторном запуске.
- Подпись Android закреплённым ключом, когда настроены секреты.
- Подписанный IPA, когда владелец настроит Apple-подпись.
- Выгрузка артефактов и удаление временного keychain/профиля.

Успех задачи android-signed при отсутствующих секретах означает только успешную проверку конфигурации: этап сборки в таком случае явно SKIPPED. Готовый локально подписанный APK передаётся отдельно. У iOS подписанный job отключён до наличия Apple-подписи. Не принимайте пропущенный шаг за сборку.

## Android: настроить один раз для будущих обновлений

Откройте https://github.com/zabbarov13-star/manager-game/settings/secrets/actions . Добавьте:

- MANAGER_ANDROID_KEY_B64 — Base64 содержимого manager-personal.p12 из приватного резервного комплекта.
- MANAGER_ANDROID_KEY_PASSWORD — содержимое password.txt из того же комплекта.

Это секреты GitHub, не обычные файлы репозитория. Не отправляйте их в чат. После сохранения выберите мобильную ветку и перезапустите workflow. Подпись должна совпасть с mobile/android/release.json. Для обновлений увеличивайте versionCode.

## iPhone / iPad: что требуется от владельца

Нужна Apple Developer Team с правом регистрации приложения/распространения. Не нужны пароль Apple ID в чате или передача личной учётной записи разработчику.

Владелец/администратор Team добавляет в GitHub Actions Secrets:

- IOS_CERTIFICATE_B64 — экспортированный Apple-сертификат с закрытым ключом в формате p12, в Base64.
- IOS_CERTIFICATE_PASSWORD — пароль p12.
- IOS_PROFILE_B64 — provisioning profile для нужного bundle ID, в Base64.

В Actions Variables добавляет:

- MANAGER_IOS_SIGNING = true — включает подписанный job.
- IOS_BUNDLE_ID — зарегистрированный в своей Team идентификатор (по умолчанию ru.manager.backtothepast).
- IOS_EXPORT_METHOD — release-testing для подходящего ad-hoc профиля либо app-store-connect для соответствующего распространения.

Для ad-hoc установки в provisioning profile должны быть зарегистрированы конкретные iPhone/iPad. Для обычного распространения через TestFlight нужны App Store Connect и загрузка подписанной сборки; экспорт IPA сам по себе не делает его устанавливаемым на любой iPhone. При необходимости дальнейшую загрузку в TestFlight можно автоматизировать с отдельным API-ключом App Store Connect, также только через CI Secrets.

После настройки секретов одна задача CI создаст подписанный IPA для iPhone и iPad. Сертификат проверяется по соответствию provisioning profile, временные приватные файлы удаляются всегда. Разработчику не требуется ваш пароль Apple ID. Физические устройства и разные сети проверяются отдельно от симуляторов.
