# Construye edp.exe self-contained (Windows x64) en launcher\dist
dotnet publish "$PSScriptRoot\edp.csproj" -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o "$PSScriptRoot\dist"
Write-Host ""
Write-Host "edp.exe listo en: $PSScriptRoot\dist\edp.exe"
Write-Host "Uso: edp.exe          (arranca el stack y abre la UI)"
Write-Host "      edp.exe stop    (detiene el stack)"
