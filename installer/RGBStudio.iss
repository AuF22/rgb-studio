; Inno Setup script for RGB Studio.
; Built by tools\build.ps1:  ISCC.exe /DAppVersion=1.0.0 installer\RGBStudio.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "RGB Studio"
#define AppExe "RGB Studio.exe"
#define TaskName "RGB Studio"

[Setup]
AppId={{6B0F6C52-3D2E-4C1B-9E1A-7A5C2F8D4E31}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=RGB Studio
AppPublisherURL=https://github.com/AuF22/rgb-studio
AppSupportURL=https://github.com/AuF22/rgb-studio/issues
#ifdef TestMode
; local smoke test without UAC: per-user install into a throwaway folder
DefaultDirName={localappdata}\RGBStudioInstallTest
PrivilegesRequired=lowest
#else
DefaultDirName={autopf}\{#AppName}
PrivilegesRequired=admin
#endif
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\LICENSE
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
#ifndef TestMode
CloseApplications=force
#endif
OutputDir=..\release
OutputBaseFilename=RGB-Studio-Setup-{#AppVersion}

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
russian.AutoStart=Запускать вместе с Windows (в трей, подсветка восстановится сама)
english.AutoStart=Start with Windows (in the tray, lighting is restored automatically)
russian.PawnIO=Установить драйвер PawnIO (нужен для оперативной памяти и части материнских плат)
english.PawnIO=Install the PawnIO driver (needed for RAM and some motherboards)
russian.Extras=Дополнительно:
english.Extras=Extras:
russian.InstallingPawnIO=Установка драйвера PawnIO...
english.InstallingPawnIO=Installing the PawnIO driver...

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "{cm:AutoStart}"; GroupDescription: "{cm:Extras}"
Name: "pawnio"; Description: "{cm:PawnIO}"; GroupDescription: "{cm:Extras}"; Check: not PawnIOInstalled

[Files]
Source: "..\release\RGB Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
; scheduled task with highest privileges: starts elevated at logon without a UAC prompt
Filename: "{sys}\schtasks.exe"; \
  Parameters: "/Create /TN ""{#TaskName}"" /TR ""\""{app}\{#AppExe}\"" --minimized"" /SC ONLOGON /RL HIGHEST /F"; \
  Flags: runhidden; Tasks: autostart
Filename: "{app}\openrgb\PawnIO_setup.exe"; Parameters: "-install -silent"; \
  StatusMsg: "{cm:InstallingPawnIO}"; Flags: waituntilterminated; Tasks: pawnio
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
#ifndef TestMode
Filename: "{sys}\taskkill.exe"; Parameters: "/IM ""{#AppExe}"" /F"; Flags: runhidden; RunOnceId: "KillApp"
#endif
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""{#TaskName}"" /F"; Flags: runhidden; RunOnceId: "DelTask"

[Code]
function PawnIOInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\PawnIO');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  { the app lives in the tray; close it so its files can be replaced }
  #ifndef TestMode
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM "{#AppExe}" /F', '', SW_HIDE, ewWaitUntilTerminated, Code);
  #endif
  Result := '';
end;
