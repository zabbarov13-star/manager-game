# iPhone / iPad: установка без самостоятельной компиляции

## Что подготовлено

Настоящее устройство-приложение скомпилировано Xcode на GitHub macOS runner. Для iPhone и iPad используется один arm64 IPA с UIDeviceFamily1,2. Файл с пометкой UNSIGNED не содержит Apple-подпись и сам по себе не устанавливается через «Файлы». Это не заглушка и не переименованный HTML: внутри Payload/Manager.app находятся Mach-O executable, Info.plist и встроенная игра.

## Предпочтительный способ распространения — Apple-подпись в CI

Владелец Apple Developer Team добавляет сертификат и provisioning profile в защищённые GitHub Actions Secrets по CI-SECRETS-RU.md. Сборка, подпись и экспорт выполняются облачно; локальный Mac/Android Studio/Xcode конечному пользователю не нужны. Для ad-hoc установки профиль должен включать конкретные устройства. Для TestFlight нужны App Store Connect и последующая загрузка подписанной сборки.

## Личная установка через Windows — дополнительный вариант

Готовый UNSIGNED.ipa можно передать AltStore Classic/AltServer для подписания своим Apple Account на своём компьютере. Исходники компилировать не нужно. Этот способ для данной игры на физических устройствах ещё не проверялся, поэтому совместимость конкретной установки не заявляется подтверждённой.

1. Установите AltServer и AltStore строго по официальной инструкции для Windows: https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows . Она описывает нужные версии iTunes/iCloud, подключение iPhone/iPad и доверие устройству.
2. Выполните вход в свой Apple Account в официальном клиенте на своём компьютере. Пароль Apple ID, сертификаты и приватные ключи не отправляются в чат и не записываются в репозиторий.
3. В AltStore Classic откройте My Apps, нажмите «+» и выберите подготовленный IPA. На iOS16+ потребуется Developer Mode согласно официальному руководству.
4. Для бесплатной учётной записи подпись требует обновления каждые семь дней, одновременно доступны до трёх таких приложений. Для обновления подписи AltStore использует AltServer на компьютере.

Ограничения и обновление: https://faq.altstore.io/altstore-classic/your-altstore . Связь с AltServer: https://faq.altstore.io/altstore-classic/altserver . Ограничения Personal Team подтверждены Apple: https://developer.apple.com/help/account/basics/about-your-developer-account . Сторонние установщики в комплект игры не включены.

Подпись и установка — действия, требующие авторизации самого владельца Apple Account. Ни создание ZIP Payload, ни успешная компиляция не заменяют эту авторизацию. Для обычной установки через TestFlight следуйте первому способу.
