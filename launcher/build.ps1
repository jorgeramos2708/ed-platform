# Construye edp.exe self-contained (Windows x64) en launcher\dist - FALLA si el publish falla
dotnet publish "$PSScriptRoot\edp.csproj" -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o "$PSScriptRoot\dist"
if ($LASTEXITCODE -ne 0) {
    Write-Error "dotnet publish fallo (exit $LASTEXITCODE) - el binario anterior NO se actualizo"
    exit $LASTEXITCODE
}
Write-Host ""
Write-Host "edp.exe listo en: $PSScriptRoot\dist\edp.exe"
Write-Host "Uso: edp.exe          (arranca el stack y abre la UI)"
Write-Host "      edp.exe build   (reconstruye las imagenes tras cambios de codigo)"
Write-Host "      edp.exe stop    (detiene el stack)"
