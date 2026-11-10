[Setup]
AppId=ru.manager.backtothepast.preview
AppName=Manager
AppVersion=0.19.1-preview.3
DefaultDirName={localappdata}\Programs\ManagerPreview
DefaultGroupName=Manager Preview
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=out
OutputBaseFilename=Manager-win-x64
Compression=lzma2
SolidCompression=yes
CloseApplications=yes

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Manager"; Filename: "{app}\Manager.exe"
