# Повторяемая сборка

Python3 и JDK21. SDK Platform35/Build Tools35.0.0 проверяются по сохранённым контрольным суммам.

```sh
python3 mobile/tools/build-client.py
python3 mobile/android/setup-sdk.py --directory /absolute/path/sdk
python3 mobile/android/build.py --sdk /absolute/path/sdk --html /absolute/path/repo/mobile/android/assets/game.html --output /absolute/path/Manager-Android.apk --keystore /private/manager-personal.p12 --password-file /private/password.txt --previous-apk /private/previous-personal.apk
```

Для первой личной версии предыдущего APK нет — параметр --previous-apk опускается. При обновлениях используйте его для проверки package ID, возрастания versionCode и сертификата. В CI ключ берётся только из GitHub Actions Secrets; новый ключ на каждом запуске не создаётся. В рабочий каталог/артефакты CI приватный ключ не включается.

Приватный резервный архив подписи храните в двух защищённых местах. Не отправляйте пароль в чат и не добавляйте p12 в git. Владелец может установить секреты через Settings → Secrets and variables → Actions или безопасную форму gh secret set.
